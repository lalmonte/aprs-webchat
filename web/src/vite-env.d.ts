/// <reference types="vite/client" />

declare module '*?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
