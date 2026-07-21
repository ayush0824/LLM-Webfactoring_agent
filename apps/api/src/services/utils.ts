import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_VERSION = "v1";
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 3;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SCRYPT_HASH_MAX_LENGTH = 256;
const LEGACY_PASSWORD_PATTERN = /^[a-f0-9]{64}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

interface ScryptParameters {
	N: number;
	r: number;
	p: number;
}

function deriveScryptKey(
	password: string,
	salt: Buffer,
	parameters: ScryptParameters,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(
			password,
			salt,
			SCRYPT_KEY_LENGTH,
			{
				N: parameters.N,
				r: parameters.r,
				p: parameters.p,
				maxmem: SCRYPT_MAX_MEMORY,
			},
			(error, derivedKey) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(derivedKey);
			},
		);
	});
}

function parseScryptHash(hashedPassword: string): {
	parameters: ScryptParameters;
	salt: Buffer;
	derivedKey: Buffer;
} | null {
	if (hashedPassword.length > SCRYPT_HASH_MAX_LENGTH) {
		return null;
	}

	const [algorithm, version, parameterString, encodedSalt, encodedKey, ...extraParts] =
		hashedPassword.split("$");

	if (
		algorithm !== "scrypt" ||
		version !== SCRYPT_VERSION ||
		!parameterString ||
		!encodedSalt ||
		!encodedKey ||
		extraParts.length > 0
	) {
		return null;
	}

	const parameterMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parameterString);
	if (!parameterMatch) {
		return null;
	}

	const parameters = {
		N: Number(parameterMatch[1]),
		r: Number(parameterMatch[2]),
		p: Number(parameterMatch[3]),
	};

	if (
		!Number.isInteger(parameters.N) ||
		parameters.N < 2 ||
		(parameters.N & (parameters.N - 1)) !== 0 ||
		parameters.N > SCRYPT_COST ||
		!Number.isInteger(parameters.r) ||
		parameters.r < 1 ||
		parameters.r > SCRYPT_BLOCK_SIZE ||
		!Number.isInteger(parameters.p) ||
		parameters.p < 1 ||
		parameters.p > SCRYPT_PARALLELIZATION
	) {
		return null;
	}

	try {
		if (!BASE64URL_PATTERN.test(encodedSalt) || !BASE64URL_PATTERN.test(encodedKey)) {
			return null;
		}

		const salt = Buffer.from(encodedSalt, "base64url");
		const derivedKey = Buffer.from(encodedKey, "base64url");
		if (
			salt.length !== SCRYPT_SALT_LENGTH ||
			derivedKey.length !== SCRYPT_KEY_LENGTH ||
			salt.toString("base64url") !== encodedSalt ||
			derivedKey.toString("base64url") !== encodedKey
		) {
			return null;
		}
		return { parameters, salt, derivedKey };
	} catch {
		return null;
	}
}

function legacyPasswordDigest(password: string): Buffer {
	return createHash("sha256").update(`${password}salt`).digest();
}

/**
 * Generate a simple ID
 */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Hash a password using a versioned, adaptive scrypt format. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SCRYPT_SALT_LENGTH);
	const parameters = {
		N: SCRYPT_COST,
		r: SCRYPT_BLOCK_SIZE,
		p: SCRYPT_PARALLELIZATION,
	};
	const derivedKey = await deriveScryptKey(password, salt, parameters);

	return [
		"scrypt",
		SCRYPT_VERSION,
		`N=${parameters.N},r=${parameters.r},p=${parameters.p}`,
		salt.toString("base64url"),
		derivedKey.toString("base64url"),
	].join("$");
}

/** Return whether a stored hash uses the legacy single-round SHA-256 format. */
export function isLegacyPasswordHash(hashedPassword: string): boolean {
	return LEGACY_PASSWORD_PATTERN.test(hashedPassword);
}

/** Verify a password against either the current scrypt or legacy SHA-256 format. */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
	if (isLegacyPasswordHash(hashedPassword)) {
		const storedDigest = Buffer.from(hashedPassword, "hex");
		return timingSafeEqual(legacyPasswordDigest(password), storedDigest);
	}

	const parsedHash = parseScryptHash(hashedPassword);
	if (!parsedHash) {
		return false;
	}

	try {
		const derivedKey = await deriveScryptKey(password, parsedHash.salt, parsedHash.parameters);
		return timingSafeEqual(derivedKey, parsedHash.derivedKey);
	} catch {
		return false;
	}
}

/**
 * Convert Date to protobuf Timestamp
 */
export function toProtoTimestamp(date: Date): { seconds: bigint; nanos: number } {
	const ms = date.getTime();
	return {
		seconds: BigInt(Math.floor(ms / 1000)),
		nanos: (ms % 1000) * 1000000,
	};
}

/**
 * Convert protobuf Timestamp to Date
 */
export function fromProtoTimestamp(timestamp: { seconds: bigint; nanos: number }): Date {
	return new Date(Number(timestamp.seconds) * 1000 + timestamp.nanos / 1000000);
}
