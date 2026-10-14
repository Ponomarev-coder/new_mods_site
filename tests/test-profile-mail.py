"""PHP mail forms and confirmations against a disposable PostgreSQL database.

Requires PHP CLI with pdo_pgsql and psql. SMTP is replaced by a capture fixture.
KIKCUSTOM_TEST_DATABASE_URL must permit CREATEDB; only the newly created database is changed.
Optional: KIKCUSTOM_TEST_PHP, KIKCUSTOM_TEST_PSQL.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import urlsplit, urlunsplit, unquote
from uuid import uuid4

REPO = Path(__file__).resolve().parents[2]

class ProfileMail(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = os.environ.get('KIKCUSTOM_TEST_DATABASE_URL')
        if not cls.base: raise unittest.SkipTest('Set KIKCUSTOM_TEST_DATABASE_URL to a disposable PostgreSQL server')
        cls.php = os.environ.get('KIKCUSTOM_TEST_PHP', 'php')
        cls.psql = os.environ.get('KIKCUSTOM_TEST_PSQL', 'psql')
        cls.name = 'kik_mail_test_' + uuid4().hex
        cls.temp = tempfile.TemporaryDirectory(prefix='kik-mail-forms-')
        cls.root = Path(cls.temp.name)
        parts = urlsplit(cls.base)
        cls.url = urlunsplit((parts.scheme, parts.netloc, '/' + cls.name, '', ''))
        cls.env = {**os.environ, 'KIKCUSTOM_DATABASE_URL':cls.url,
            'DB_HOST':parts.hostname, 'DB_PORT':str(parts.port or 5432), 'DB_USER':unquote(parts.username or ''),
            'DB_PASS':unquote(parts.password or ''), 'DB_NAME':cls.name, 'KIK_TEST_MAIL_CAPTURE':str(cls.root/'mail.json')}
        subprocess.run([cls.psql, cls.base, '-X', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE '+cls.name],check=True,capture_output=True)
        try:
            cls.sql((REPO/'SQL/users.sql').read_text())
            for migration in sorted((REPO/'KIKCustom-system-core/migrations').glob('*.sql')):cls.sql(migration.read_text())
            shutil.copytree(REPO/'user_data', cls.root/'user_data')
            (cls.root/'api').mkdir();shutil.copy2(REPO/'api/db.php',cls.root/'api/db.php')
            (cls.root/'security').mkdir();shutil.copy2(REPO/'security/confirm_profile_change.php',cls.root/'security/confirm_profile_change.php')
            (cls.root/'vendor').mkdir()
            (cls.root/'vendor/autoload.php').write_text('''<?php
namespace PHPMailer\\PHPMailer;
#[\\AllowDynamicProperties]
class PHPMailer {
    const ENCRYPTION_STARTTLS='tls'; const ENCRYPTION_SMTPS='ssl';
    public function __construct(...$args) {}
    public function __call($name,$args) { if($name==='addAddress')$this->recipient=$args[0]; return true; }
    public function send() {
        if(getenv('KIK_TEST_MAIL_FAIL')==='1')return false;
        file_put_contents(getenv('KIK_TEST_MAIL_CAPTURE'),json_encode(['to'=>$this->recipient,'subject'=>$this->Subject,'html'=>$this->Body,'plain'=>$this->AltBody],JSON_UNESCAPED_UNICODE)); return true;
    }
}
''')
            wrapper=cls.root/'confirm.php'
            wrapper.write_text('''<?php
ini_set('session.save_path',__DIR__);
$p=json_decode(stream_get_contents(STDIN),true);
$_SERVER['REQUEST_METHOD']=$p['method'];$_SERVER['HTTP_HOST']='modskik.ru';$_SERVER['HTTPS']='on';
$_GET=['token'=>$p['token']];$_POST=['token'=>$p['token']];
require __DIR__.'/security/confirm_profile_change.php';
''')
            cls.hash=subprocess.check_output([cls.php,'-r',"echo password_hash('test password 123',PASSWORD_BCRYPT);"],text=True).strip()
        except BaseException:
            subprocess.run([cls.psql,cls.base,'-X','-c','DROP DATABASE '+cls.name+' WITH (FORCE)'],capture_output=True)
            cls.temp.cleanup();raise
    @classmethod
    def tearDownClass(cls):
        subprocess.run([cls.psql,cls.base,'-X','-v','ON_ERROR_STOP=1','-c','DROP DATABASE '+cls.name+' WITH (FORCE)'],check=True,capture_output=True)
        cls.temp.cleanup()
    @classmethod
    def sql(cls,sql):
        result=subprocess.run([cls.psql,cls.url,'-X','-A','-t','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,check=True)
        return result.stdout.strip()
    def setUp(self):
        self.sql("TRUNCATE users,mods,user_change_requests RESTART IDENTITY CASCADE;")
        self.sql("INSERT INTO users(username,email,password,\"firstName\",\"lastName\") VALUES ('owner','owner@example.org','"+self.hash+"','First','Last'),('other','other@example.org','"+self.hash+"','Other','User');")
        self.sql("INSERT INTO mods(\"modName\",author,game,specs,description,download_url,size_mb,user_id) VALUES ('Карта <test>','owner','ETS2','Maps','Описание','https://example.org/mod.zip',1,1),('Other','other','ETS2','Maps','Other','https://example.org/other.zip',1,2);")
        self.sql("INSERT INTO kikcustom_uploads(id,user_id,title,game,description,storage_name,sha256,size_bytes,status,scan_report,published_mod_id) VALUES ('00000000-0000-0000-0000-000000000001',1,'Published','ETS2','Desc','published.zip',repeat('a',64),1,'approved','{}',1),('00000000-0000-0000-0000-000000000002',1,'Pending','ETS2','Desc','pending.zip',repeat('b',64),1,'pending_review','{}',NULL);")
        self.sql("INSERT INTO kikcustom_images(upload_id,position,data) VALUES('00000000-0000-0000-0000-000000000001',0,'fixture'),('00000000-0000-0000-0000-000000000002',0,'fixture');")
        (self.root/'mail.json').unlink(missing_ok=True)
    def request(self,action,data,fail=False):
        payload={'action':action,'data':data,'user_id':1,'origin':'https://modskik.ru'}
        result=subprocess.run([self.php,str(self.root/'user_data/kikcustom_mail_bridge.php')],input=json.dumps(payload),text=True,capture_output=True,env={**self.env,'KIK_TEST_MAIL_FAIL':'1' if fail else '0'},check=True)
        return json.loads(result.stdout)
    def confirm(self,token,method='POST'):
        return subprocess.run([self.php,str(self.root/'confirm.php')],input=json.dumps({'token':token,'method':method}),text=True,capture_output=True,env=self.env,check=True).stdout
    def test_email_uses_template_and_requires_post_confirmation(self):
        self.assertEqual(self.request('email',{'email':'new@example.org'})['_http_status'],200)
        mail=json.loads((self.root/'mail.json').read_text());self.assertEqual(mail['to'],'new@example.org')
        self.assertIn('linear-gradient(135deg,#2a8be0,#da870b)',mail['html']);self.assertIn('Подтверждение почты',mail['html'])
        token=self.sql("SELECT token FROM user_change_requests")
        self.assertIn('Подтвердить',self.confirm(token,'GET'))
        self.assertEqual(self.sql('SELECT email FROM users WHERE id=1'),'owner@example.org')
        self.assertIn('Email подтверждён',self.confirm(token))
        self.assertEqual(self.sql('SELECT email FROM users WHERE id=1'),'new@example.org')
        self.assertEqual(self.sql('SELECT sessions_revoked_at IS NOT NULL FROM users WHERE id=1'),'t')
        self.assertIn('Срок действия истёк',self.confirm(token))
    def test_failed_mail_removes_its_pending_request(self):
        result=self.request('email',{'email':'new@example.org'},fail=True)
        self.assertEqual(result['error'],'mail_not_sent');self.assertEqual(self.sql('SELECT count(*) FROM user_change_requests'),'0')
    def test_mod_deletion_checks_ownership_and_removes_new_comments(self):
        self.assertEqual(self.request('mod_delete',{'id':2})['error'],'mod_not_found')
        self.assertEqual(self.request('mod_delete',{'id':1})['_http_status'],200)
        self.sql("INSERT INTO kikcustom_comments(mod_id,user_id,name,body) VALUES(1,1,'owner','Comment')")
        token=self.sql('SELECT token FROM user_change_requests')
        self.assertIn('Мод удалён',self.confirm(token))
        self.assertEqual(self.sql('SELECT count(*) FROM mods WHERE id=1'),'0')
        self.assertEqual(self.sql('SELECT count(*) FROM kikcustom_comments'),'0')
        self.assertEqual(self.sql('SELECT count(*) FROM mods WHERE id=2'),'1')
        self.assertEqual(self.sql("SELECT published_mod_id IS NULL FROM kikcustom_uploads WHERE id='00000000-0000-0000-0000-000000000001'"),'t')
    def test_account_deletion_checks_password_and_preserves_anonymous_mods(self):
        data={'email':'owner@example.org','password':'wrong','confirmText':'Удалить аккаунт','deleteMods':False}
        self.assertEqual(self.request('account_delete',data)['error'],'account_credentials_invalid')
        data['password']='test password 123';self.assertEqual(self.request('account_delete',data)['_http_status'],200)
        token=self.sql('SELECT token FROM user_change_requests')
        self.assertIn('Аккаунт удалён',self.confirm(token))
        self.assertEqual(self.sql('SELECT count(*) FROM users WHERE id=1'),'0')
        self.assertEqual(self.sql('SELECT user_id FROM mods WHERE id=1'),'0')
        self.assertEqual(self.sql('SELECT author FROM mods WHERE id=1'),'Удалённый пользователь')
        self.assertEqual(self.sql('SELECT count(*) FROM kikcustom_images'),'1')
        self.assertEqual(self.sql('SELECT count(*) FROM kikcustom_uploads'),'1')
        self.assertEqual(self.sql('SELECT user_id IS NULL FROM kikcustom_uploads'),'t')
    def test_password_requests_are_unavailable_in_the_bridge(self):
        self.assertEqual(self.request('password',{'password':'ignored'})['error'],'invalid_mail_request')
        self.assertFalse((self.root/'mail.json').exists())

if __name__=='__main__':unittest.main(verbosity=2)
