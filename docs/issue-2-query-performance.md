# Issue 2: Batched Post Enrichment

## Problem

Feed and post-list services loaded a page of posts and then issued two aggregate queries per post,
plus one like-status query per post for authenticated users. Bookmarks additionally loaded every
post with its own query. Those N+1 patterns made database load grow linearly with page size.

The repeated queries also could not safely be replaced by one naive join: joining likes and comments
together would multiply rows when a post had multiple records in both tables and inflate both counts.

## Fix

`enrichPosts` accepts an already ordered list of post rows and performs two fixed-size grouped
queries: one for likes (including the requester's `isLiked` status) and one for comments. Separate
aggregates prevent join multiplication. It initializes every post with zero counts and
`isLiked: false`, then maps results back without changing row order, nullable author values, or
response shape.

Home, explore, general post lists, user post lists, single-post loading, and bookmarks share this
utility. Bookmarks now fetch all selected post details with one `IN` query and restore the ordering
from the paginated bookmark query. Pagination still occurs before enrichment.

The profile route no longer calls the separate follower-count and following-count RPCs because
`getUser` already returns those exact values. Its other RPCs are unchanged.

## SQL query counts

Counts below assume 10 returned posts and a valid authenticated viewer. The profile scenario is a
viewer opening another user's profile containing 10 posts. "Before" is calculated from the original
service code. Service-level "after" counts are measured directly by test-only instrumentation around
the database client's actual `execute` calls.

| API operation | Before | After | Explanation after |
| --- | ---: | ---: | --- |
| `getHomeFeed` service | 32 | 4 | followed users, posts, grouped likes, grouped comments |
| `getBookmarkedPosts` service | 41 | 4 | bookmarks, post details, grouped likes, grouped comments |
| profile `getUserPosts` service | 32 | 4 | user, posts, grouped likes, grouped comments |
| profile `getUser` service | 5 | 5 | user, three counts, requester follow status |
| profile `getCurrentUser` service | 1 | 1 | current user |
| profile `getFollowStatus` service | 2 | 2 | follow target and status; unchanged |

Empty results skip enrichment: home feed executes 2 queries and bookmarks executes 1. Both 1-post
and 10-post results execute 4 queries, demonstrating that enrichment query count is constant.

## RPC and full-page totals

These totals distinguish directly measured service SQL counts from page-level totals derived from the
verified RPC composition. Route totals include the route component, its post-level `BookmarkButton`
status calls, and other route children. Cold-page totals additionally include the shared header's
current-user load and notification-count call; SPA navigation may reuse an already-mounted header, so
both numbers are shown.

| Page | Route SQL before → after | Cold-page SQL before → after | Route RPCs | Cold-page RPCs |
| --- | ---: | ---: | ---: | ---: |
| Home | 43 → 15 | 45 → 17 | 12 | 14 |
| Bookmarks | 52 → 15 | 54 → 17 | 12 | 14 |
| Other-user profile | 54 → 22 | 56 → 24 | 16 → 14 | 18 → 16 |

For the profile route, the two removed RPCs were `getFollowerCount` and `getFollowingCount` (two SQL
queries each). The child follow button's `getFollowStatus` RPC remains because changing its behavior
was not required for eliminating the redundant count requests. Each displayed post still performs
one bookmark-status RPC, so the full-page totals include 10 such calls.

## Compatibility and regression coverage

No protobuf or API response contract changed. Tests cover 0, 1, and 10 posts; exact ordering and
pagination boundaries; zero counts; nullable avatars; multiple likes and comments without count
multiplication; anonymous `isLiked: false`; authenticated `isLiked`; bookmark ordering; full response
equality between anonymous and authenticated enrichment apart from the expected `isLiked` value; and
the fixed SQL query counts for home feed, bookmarks, user posts, and profile counts.
