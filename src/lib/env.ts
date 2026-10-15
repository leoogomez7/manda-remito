export const PASSWORD = import.meta.env.VITE_PASSWORD ?? "";

export const AUTH_CONFIG = {
	domain: import.meta.env.DOMAIN_USER?.trim() ?? "",
	clientId: import.meta.env.AUTH_USER?.trim() ?? "",
	orgCode: import.meta.env.CODE_ORG?.trim() ?? "",
};
