import { inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { comments, likes } = schema;

export interface PostEngagement {
	likeCount: number;
	commentCount: number;
	isLiked: boolean;
}

/**
 * Add engagement data to an ordered set of posts using fixed-size aggregate queries.
 * Likes and comments are aggregated separately to avoid multiplying rows when a post
 * has multiple records in both tables.
 */
export async function enrichPosts<T extends { id: string }>(
	postRows: readonly T[],
	requesterId?: string,
): Promise<Array<T & PostEngagement>> {
	if (postRows.length === 0) {
		return [];
	}

	const postIds = [...new Set(postRows.map((post) => post.id))];
	const requesterLiked = requesterId
		? sql<number>`max(case when ${likes.userId} = ${requesterId} then 1 else 0 end)`
		: sql<number>`0`;

	const [likeRows, commentRows] = await Promise.all([
		db
			.select({
				postId: likes.postId,
				likeCount: sql<number>`count(*)`,
				isLiked: requesterLiked,
			})
			.from(likes)
			.where(inArray(likes.postId, postIds))
			.groupBy(likes.postId),
		db
			.select({
				postId: comments.postId,
				commentCount: sql<number>`count(*)`,
			})
			.from(comments)
			.where(inArray(comments.postId, postIds))
			.groupBy(comments.postId),
	]);

	const engagementByPost = new Map<string, PostEngagement>(
		postIds.map((postId) => [postId, { likeCount: 0, commentCount: 0, isLiked: false }]),
	);

	for (const row of likeRows) {
		if (!row.postId) continue;
		const engagement = engagementByPost.get(row.postId);
		if (!engagement) continue;
		engagement.likeCount = Number(row.likeCount);
		engagement.isLiked = Boolean(row.isLiked);
	}

	for (const row of commentRows) {
		const engagement = engagementByPost.get(row.postId);
		if (engagement) {
			engagement.commentCount = Number(row.commentCount);
		}
	}

	return postRows.map((post) => ({
		...post,
		...(engagementByPost.get(post.id) ?? {
			likeCount: 0,
			commentCount: 0,
			isLiked: false,
		}),
	}));
}
