export const initClarity = () => {
  // Only initialize in the browser environment and avoid duplicate initialization
  if (typeof window !== 'undefined' && !(window as any).clarity) {
    (function(c: any, l: any, a: string, r: string, i: string, t?: any, y?: any) {
        c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r);
        t.async = 1;
        t.src = "https://www.clarity.ms/tag/" + i;
        y = l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", "xc3m8w1rqc");
    
    console.log('✓ Microsoft Clarity Analytics initialized.');
  }
};
