import { Elysia } from "elysia";
import { oauth2 } from ".";
import { staticPlugin } from "@elysiajs/static";
import { TestPage } from "./TestPage";
import { createElement } from "react";
import { rmSync } from "node:fs";
// @ts-expect-error - Bun has a issue with React that is getting fixed in the next React release
import { renderToReadableStream } from "react-dom/server.browser";
import { authPlugin } from "./auth-plugin";
import { googlePlugin } from "./google-plugin";

if (
	!process.env.GOOGLE_CLIENT_ID ||
	!process.env.GOOGLE_CLIENT_SECRET ||
	!process.env.GOOGLE_REDIRECT_URI
) {
	throw new Error("Google OAuth2 credentials are not set in .env file");
}

const buildDir = "./build";

rmSync(buildDir, { recursive: true, force: true });

const buildTimestamp = Date.now();
const { logs, success } = await Bun.build({
	entrypoints: ["./src/PageIndex.tsx"],
	outdir: "./build",
	naming: `TestBuildPage-${buildTimestamp}.[ext]`,
	minify: true,
	splitting: true,
	format: "esm"
});

if (!success) {
	throw new AggregateError(logs);
}

const handlePageRequest = async (
	pageComponent: React.ComponentType,
	index: string
) => {
	const page = createElement(pageComponent);
	const stream = await renderToReadableStream(page, {
		bootstrapModules: [index]
	});

	return new Response(stream, {
		headers: { "Content-Type": "text/html" }
	});
};

const test = new Elysia().use(
	staticPlugin({
		assets: "./build",
		prefix: ""
	})
);
test.use(
	authPlugin({ // This is the same code except it is meant to be generalized for any OAuth2 provider and doesn't have correct type safety
		Google: [
			process.env.GOOGLE_CLIENT_ID,
			process.env.GOOGLE_CLIENT_SECRET,
			process.env.GOOGLE_REDIRECT_URI
		],
		GitHub: ["client_id", "client_secret", "redirect_uri"]
	}))
// test.use(googlePlugin); // This is the same code except only for the Google OAuth2 meaning it gets correct type safety
test.get("/", () =>
	handlePageRequest(TestPage, `TestBuildPage-${buildTimestamp}.js`)
)
	.get("/test-page-1", () =>
		handlePageRequest(TestPage, `TestBuildPage-${buildTimestamp}.js`)
	)
	.get("/test-page-2", () =>
		handlePageRequest(TestPage, `TestBuildPage-${buildTimestamp}.js`)
	)
	.listen(3000, () => {
		console.log("Server is running on http://localhost:3000");
	});
