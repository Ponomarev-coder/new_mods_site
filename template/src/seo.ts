import { useEffect } from 'react';
export function useSeo(title: string, description: string, path: string, noindex = false) {
  useEffect(() => {
    document.title = title;
    const meta = (key: string, content: string, property = false) => {
      const attribute = property ? 'property' : 'name';
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.append(element); }
      element.content = content;
    };
    const url = 'https://modskik.ru' + path;
    meta('description', description.slice(0, 180));
    meta('robots', noindex ? 'noindex, follow' : 'index, follow');
    meta('og:title', title, true); meta('og:description', description.slice(0,180), true); meta('og:url', url, true);
    meta('twitter:title', title); meta('twitter:description', description.slice(0,180));
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = url;
  }, [title, description, path, noindex]);
}
