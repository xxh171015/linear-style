export function normalizeResourceURL(value: string) {
  try {
    const url=new URL(value.trim());
    if(!["https:","http:"].includes(url.protocol) || url.username || url.password)throw Error();
    return url.href;
  } catch { throw Error("Enter a valid http or https URL."); }
}
