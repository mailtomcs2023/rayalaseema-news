// /edit-article is a legacy route - the screen is now part of /new-article,
// which handles both create (no ?id=) and edit (?id=<articleId>) modes.
// Kept as a redirect so any stale link or push from older code still works.
export { NewArticleScreen as default } from "../src/screens/NewArticleScreen";
