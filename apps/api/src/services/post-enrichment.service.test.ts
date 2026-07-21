import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	createTestComment,
	createTestFollow,
	createTestLike,
	createTestPost,
	createTestUser,
} from "../../tests/helpers";
import { countSqlQueries } from "../../tests/query-counter";
import { db, schema } from "../db";
import { getBookmarkedPosts } from "./bookmarks.service";
import { getExploreFeed, getHomeFeed } from "./feed.service";
import { getUserPosts } from "./posts.service";
import { getUser } from "./users.service";

const { bookmarks, posts } = schema;

async function createOrderedPosts(authorId: string, count: number) {
	const createdPosts: Array<{ id: string; content: string; createdAt: Date }> = [];

	for (let index = 0; index < count; index++) {
		const content = `Post ${index}`;
		const id = await createTestPost(authorId, content);
		const createdAt = new Date(Date.UTC(2025, 0, 1, 0, 0, index));
		await db.update(posts).set({ createdAt, updatedAt: createdAt }).where(eq(posts.id, id));
		createdPosts.push({ id, content, createdAt });
	}

	return createdPosts;
}

async function bookmarkPosts(userId: string, postIds: string[]) {
	for (const [index, postId] of postIds.entries()) {
		await db.insert(bookmarks).values({
			id: `bookmark-${userId}-${index}`,
			userId,
			postId,
			createdAt: new Date(Date.UTC(2025, 0, 2, 0, 0, index)),
		});
	}
}

describe("batched post enrichment", () => {
	it.each([0, 1, 10])("keeps home-feed query counts fixed for %i posts", async (postCount) => {
		const viewer = await createTestUser();
		const createdPosts = await createOrderedPosts(viewer.id, postCount);

		const { result, queryCount } = await countSqlQueries(() =>
			getHomeFeed(viewer.id, { limit: 10 }),
		);

		expect(queryCount).toBe(postCount === 0 ? 2 : 4);
		expect(result.map((post) => post.id)).toEqual(createdPosts.map((post) => post.id).reverse());
		expect(result).toHaveLength(postCount);
		expect(result.every((post) => post.likeCount === 0)).toBe(true);
		expect(result.every((post) => post.commentCount === 0)).toBe(true);
		expect(result.every((post) => post.isLiked === false)).toBe(true);
	});

	it("preserves the full response while handling multiple likes and comments", async () => {
		const author = await createTestUser({ username: "author", email: "author@example.com" });
		const viewer = await createTestUser({ username: "viewer", email: "viewer@example.com" });
		const other = await createTestUser({ username: "other", email: "other@example.com" });
		const [plainPost, popularPost] = await createOrderedPosts(author.id, 2);

		await Promise.all([
			createTestLike(viewer.id, popularPost.id),
			createTestLike(other.id, popularPost.id),
			createTestComment(popularPost.id, viewer.id, "First comment"),
			createTestComment(popularPost.id, other.id, "Second comment"),
		]);

		const anonymous = await getExploreFeed({ limit: 10 });
		const authenticated = await getExploreFeed({ limit: 10, userId: viewer.id });

		expect(authenticated).toEqual(
			anonymous.map((post) => ({
				...post,
				isLiked: post.id === popularPost.id,
			})),
		);
		expect(authenticated).toEqual([
			{
				id: popularPost.id,
				content: popularPost.content,
				createdAt: popularPost.createdAt,
				updatedAt: popularPost.createdAt,
				author: {
					id: author.id,
					username: author.username,
					displayName: author.displayName,
					avatarUrl: null,
				},
				likeCount: 2,
				commentCount: 2,
				isLiked: true,
			},
			{
				id: plainPost.id,
				content: plainPost.content,
				createdAt: plainPost.createdAt,
				updatedAt: plainPost.createdAt,
				author: {
					id: author.id,
					username: author.username,
					displayName: author.displayName,
					avatarUrl: null,
				},
				likeCount: 0,
				commentCount: 0,
				isLiked: false,
			},
		]);
	});

	it.each([0, 1, 10])("batches loading for %i bookmarked posts", async (postCount) => {
		const viewer = await createTestUser();
		const author = await createTestUser();
		const createdPosts = await createOrderedPosts(author.id, postCount);
		await bookmarkPosts(
			viewer.id,
			createdPosts.map((post) => post.id),
		);

		const { result, queryCount } = await countSqlQueries(() =>
			getBookmarkedPosts(viewer.id, viewer.id, 10),
		);

		expect(queryCount).toBe(postCount === 0 ? 1 : 4);
		expect(result.map((post) => post.id)).toEqual(createdPosts.map((post) => post.id).reverse());
		expect(result).toHaveLength(postCount);
	});

	it("preserves bookmark pagination, ordering, and authenticated like status", async () => {
		const viewer = await createTestUser();
		const author = await createTestUser();
		const createdPosts = await createOrderedPosts(author.id, 10);
		await bookmarkPosts(
			viewer.id,
			createdPosts.map((post) => post.id),
		);
		const expectedPage = [...createdPosts].reverse().slice(2, 5);
		await createTestLike(viewer.id, expectedPage[0].id);

		const { result, queryCount } = await countSqlQueries(() =>
			getBookmarkedPosts(viewer.id, viewer.id, 3, 2),
		);

		expect(queryCount).toBe(4);
		expect(result.map((post) => post.id)).toEqual(expectedPage.map((post) => post.id));
		expect(result.map((post) => post.isLiked)).toEqual([true, false, false]);
	});

	it("loads ten profile posts in four queries and preserves descending order", async () => {
		const author = await createTestUser({ username: "profile-author" });
		const viewer = await createTestUser({ username: "profile-viewer" });
		const createdPosts = await createOrderedPosts(author.id, 10);

		const { result, queryCount } = await countSqlQueries(() =>
			getUserPosts(author.username, viewer.id),
		);

		expect(queryCount).toBe(4);
		expect(result.map((post) => post.id)).toEqual(createdPosts.map((post) => post.id).reverse());
	});

	it("returns all profile counts in the existing getUser response", async () => {
		const profileUser = await createTestUser({ username: "profile-counts" });
		const viewer = await createTestUser({ username: "profile-viewer" });
		const other = await createTestUser({ username: "profile-other" });
		await createOrderedPosts(profileUser.id, 10);
		await Promise.all([
			createTestFollow(viewer.id, profileUser.id),
			createTestFollow(other.id, profileUser.id),
			createTestFollow(profileUser.id, other.id),
		]);

		const { result, queryCount } = await countSqlQueries(() =>
			getUser(profileUser.username, viewer.id),
		);

		expect(queryCount).toBe(5);
		expect(result).toMatchObject({
			followerCount: 2,
			followingCount: 1,
			postCount: 10,
			isFollowing: true,
		});
	});

	it("does not alter database ordering while enriching posts", async () => {
		const author = await createTestUser();
		await createOrderedPosts(author.id, 10);
		const expectedIds = (
			await db.select({ id: posts.id }).from(posts).orderBy(desc(posts.createdAt)).limit(10)
		).map((post) => post.id);

		const result = await getExploreFeed({ limit: 10 });

		expect(result.map((post) => post.id)).toEqual(expectedIds);
	});
});
