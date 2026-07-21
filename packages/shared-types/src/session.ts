/**
 * Session data stored in cookies
 */
export interface SessionData {
	userId: string;
	username: string;
	role: "user" | "admin" | "moderator";
	sessionToken: string;
}

/**
 * JWT payload for gRPC authentication
 */
export interface GrpcSessionPayload {
	userId: string;
	username: string;
	role: "user" | "admin" | "moderator";
	iat: number;
	exp: number;
}
