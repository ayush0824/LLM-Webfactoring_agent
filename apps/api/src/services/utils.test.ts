import { describe, expect, it } from "vitest";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "./utils";

describe("password utilities", () => {
	it("uses a unique salt for identical passwords", async () => {
		const [firstHash, secondHash] = await Promise.all([
			hashPassword("same-password"),
			hashPassword("same-password"),
		]);

		expect(firstHash).not.toBe(secondHash);
		expect(firstHash.startsWith("scrypt$v1$")).toBe(true);
		expect(secondHash.startsWith("scrypt$v1$")).toBe(true);
	});

	it("verifies the correct password and rejects an incorrect password", async () => {
		const hash = await hashPassword("correct-password");

		expect(hash).toContain("$N=32768,r=8,p=3$");
		expect(await verifyPassword("correct-password", hash)).toBe(true);
		expect(await verifyPassword("incorrect-password", hash)).toBe(false);
	});

	it("rejects malformed hashes without throwing", async () => {
		const hash = await hashPassword("correct-password");
		const parts = hash.split("$");
		const invalidBase64Salt = [
			parts[0],
			parts[1],
			parts[2],
			`${parts[3]?.slice(0, 2)}!${parts[3]?.slice(2)}`,
			parts[4],
		].join("$");

		for (const malformedHash of [
			"",
			"scrypt$v1$",
			"scrypt$v1$N=32768,r=8,p=3$bad$bad",
			invalidBase64Salt,
			`scrypt$v1$N=32768,r=8,p=3$${"A".repeat(10_000)}$${parts[4]}`,
		]) {
			await expect(verifyPassword("correct-password", malformedHash)).resolves.toBe(false);
		}
	});

	it("recognizes only the legacy SHA-256 storage format as legacy", () => {
		expect(isLegacyPasswordHash("a".repeat(64))).toBe(true);
		expect(isLegacyPasswordHash("scrypt$v1$N=32768,r=8,p=1$salt$key")).toBe(false);
	});
});
