declare module "isomorphic-dompurify" {
  const DOMPurify: {
    sanitize(
      dirty: string,
      config?: { USE_PROFILES?: { html?: boolean } }
    ): string;
  };
  export default DOMPurify;
}
