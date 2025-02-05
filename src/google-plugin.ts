import { Elysia } from "elysia";
import { oauth2 } from ".";

if (
	!process.env.GOOGLE_CLIENT_ID ||
	!process.env.GOOGLE_CLIENT_SECRET ||
	!process.env.GOOGLE_REDIRECT_URI
) {
	throw new Error("Google OAuth2 credentials are not set in .env file");
}

const fetchUserInfo = async (accessToken: string) => {
	const response = await fetch(`https://www.googleapis.com/userinfo/v2/me`, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});
	if (!response.ok) {
		const errorDetails = await response.text();
		throw new Error(errorDetails);
	}

	return await response.json();
};

export const googlePlugin = new Elysia().use(
	oauth2({
		Google: [
			process.env.GOOGLE_CLIENT_ID,
			process.env.GOOGLE_CLIENT_SECRET,
			process.env.GOOGLE_REDIRECT_URI
		],
		GitHub: ["client_id", "client_secret", "redirect_uri"]
	})
		.get("/auth/google", async ({ oauth2, redirect }) => {
			const authorizationUrl = oauth2.createURL("Google", [
				"https://www.googleapis.com/auth/userinfo.profile",
				"https://www.googleapis.com/auth/userinfo.email"
			]);

			authorizationUrl.searchParams.set("access_type", "offline");
			authorizationUrl.searchParams.set("prompt", "consent");

			return redirect(authorizationUrl.toString());
		})
		.get(
			"/auth/google/callback",
			async ({
				oauth2,
				cookie: { redirectUrl, userRefreshToken },
				error,
				redirect
			}) => {
				try {
					const token = await oauth2.authorize("Google");

					if (token.hasRefreshToken()) {
						userRefreshToken.set({
							value: token.refreshToken(),
							secure: true,
							httpOnly: true,
							sameSite: "strict"
						});
					}

					return redirect(redirectUrl.value || "/");
				} catch (err) {
					if (err instanceof Error) {
						console.error(
							"Failed to authorize Google:",
							err.message
						);
					}

					return error(500);
				}
			}
		)
		.get(
			"/auth-status",
			async ({ oauth2, error, cookie: { userRefreshToken } }) => {
				try {
					let isLoggedIn = false;
					let user = {};

					if (userRefreshToken.value !== undefined) {
						isLoggedIn = true;
						const tokens = await oauth2.refresh(
							"Google",
							userRefreshToken.value
						);

						user = await fetchUserInfo(tokens.accessToken());
					}

					return new Response(JSON.stringify({ isLoggedIn, user }), {
						headers: { "Content-Type": "application/json" }
					});
				} catch (err) {
					if (err instanceof Error) {
						console.error("Failed to refresh token:", err.message);
					}

					return error(500);
				}
			}
		)
		.put("/set-redirect-url", ({ headers, cookie, error }) => {
			try {
				const url = headers["referer"] || "/";

				cookie.redirectUrl.value = url;

				return new Response(null, {
					status: 204
				});
			} catch (err) {
				if (err instanceof Error) {
					console.error("Failed to refresh token:", err.message);
				}

				return error(500);
			}
		})
		.post(
			"/logout",
			async ({ oauth2, error, cookie: { userRefreshToken } }) => {
				try {
					if (userRefreshToken.value !== undefined) {
						const tokens = await oauth2.refresh(
							"Google",
							userRefreshToken.value
						);
						oauth2.revoke("Google", tokens.accessToken());
						userRefreshToken.remove();
						return new Response("Succesfuly Logged Out", {
							status: 204
						});
					} else {
						console.error("No refresh token found");
						return error(400);
					}
				} catch (err) {
					if (err instanceof Error) {
						console.error("Failed to refresh token:", err.message);
					}

					return error(500);
				}
			}
		)
		.put("/refresh-access-token", async ({ oauth2, cookie, error }) => {
			try {
				if (cookie.userRefreshToken.value !== undefined) {
					await oauth2.refresh(
						"Google",
						cookie.userRefreshToken.value
					);

					return new Response("Token refreshed", {
						status: 204
					});
				} else {
					console.error("No refresh token found");
					return error(400);
				}
			} catch (err) {
				if (err instanceof Error) {
					console.error("Failed to refresh token:", err.message);
				}

				return error(500);
			}
		})
		.put(
			"/revoke-refresh-token",
			async ({ oauth2, error, cookie: { userRefreshToken } }) => {
				try {
					if (userRefreshToken.value !== undefined) {
						await oauth2.revoke("Google", userRefreshToken.value);

						userRefreshToken.remove();

						return new Response("Refresh token revoked", {
							status: 204
						});
					} else {
						console.error("No refresh token found");
						return error(400);
					}
				} catch (err) {
					if (err instanceof Error) {
						console.error("Failed to revoke token:", err.message);
					}

					return error(500);
				}
			}
		)
		.put(
			"/revoke-access-token",
			async ({ oauth2, error, cookie: { userRefreshToken } }) => {
				try {
					if (userRefreshToken.value === undefined) {
						console.error("No refresh token found");
						return error(400);
					}

					const tokens = await oauth2.refresh(
						"Google",
						userRefreshToken.value
					);

					const accessToken = tokens.accessToken();

					if (!accessToken) {
						console.error("No access token found");
						return error(400);
					}

					await oauth2.revoke("Google", accessToken);

					return new Response("Access token revoked", {
						status: 204
					});
				} catch (err) {
					if (err instanceof Error) {
						console.error("Failed to revoke token:", err.message);
					}

					return error(500);
				}
			}
		)
);
