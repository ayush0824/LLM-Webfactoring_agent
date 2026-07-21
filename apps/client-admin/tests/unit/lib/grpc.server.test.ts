import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/session.server", () => ({
	getAdminSessionData: vi.fn(),
}));

import { getAdminGrpcSessionToken } from "../../../src/lib/grpc.server";
import { getAdminSessionData } from "../../../src/lib/session.server";

describe("admin gRPC authentication", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards the exact API-issued token stored in the session", async () => {
		vi.mocked(getAdminSessionData).mockResolvedValue({
			userId: "admin-123",
			username: "admin",
			role: "admin",
			sessionToken: "api-issued-admin-token",
		});

		expect(await getAdminGrpcSessionToken()).toBe("api-issued-admin-token");
	});
});
