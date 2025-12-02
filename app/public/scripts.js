/**
 * Lightweight anonymous analytics tracker
 * Sends page views and events to /a/collect endpoint for session/visitor tracking
 * Usage:
 *   <script>window.mmmdata = {label: 'load', vars: {funnel_stage: 'one'}}</script>
 *   <script src="/scripts.js" async></script>
 *   mm('event', { label: 'button_click', vars: { category: 'nav' } });
 */
(function(){var e=window.location.href,t=document.title,n=Intl.DateTimeFormat().resolvedOptions().timeZone,o=navigator.language||navigator.userLanguage||"",a=window.devicePixelRatio||1,r=window.innerWidth+"x"+window.innerHeight,i=window.mmmdata||{};function c(e,t){fetch("/a/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t),keepalive:!0}).catch(function(){})}function l(l,s){var d={type:l||"page",url:e,title:t,tz:n,locale:o,dpr:a,viewport:r};if(s)for(var f in s)s.hasOwnProperty(f)&&(d[f]=s[f]);if(i.label&&(d.label=i.label),i.vars){d.vars=d.vars||{};for(var u in i.vars)i.vars.hasOwnProperty(u)&&(d.vars[u]=i.vars[u])}c(0,d)}window.mm=l,l("page")})();
