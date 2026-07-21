import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { countSqlQueries } from "./query-counter";

const { users } = schema;

async function executeQueries(count: number): Promise<void> {
	for (let index = 0; index < count; index++) {
		await db.select({ id: users.id }).from(users);
	}
}

describe("query counter", () => {
	it("isolates concurrent measurement contexts", async () => {
		const [first, second] = await Promise.all([
			countSqlQueries(async () => executeQueries(2)),
			countSqlQueries(async () => executeQueries(3)),
		]);

		expect(first.queryCount).toBe(2);
		expect(second.queryCount).toBe(3);
	});

	it("does not count queries outside a measurement", async () => {
		await executeQueries(2);

		const measured = await countSqlQueries(async () => executeQueries(1));

		await executeQueries(2);
		expect(measured.queryCount).toBe(1);
	});
});
