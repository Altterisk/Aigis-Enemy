import { Link } from "react-router-dom";
import { NOT_FOUND_META } from "../meta";
import { usePageMeta } from "../usePageMeta";

// Unknown paths: the host answers every path with index.html, so this page
// marks itself noindex.
export default function NotFound() {
  usePageMeta(NOT_FOUND_META);
  return (
    <p>
      Page not found. <Link to="/units">Back to units</Link>
    </p>
  );
}
