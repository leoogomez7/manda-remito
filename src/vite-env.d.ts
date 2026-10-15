/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DOMAIN_USER?: string;
	readonly AUTH_USER?: string;
	readonly CODE_ORG?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}