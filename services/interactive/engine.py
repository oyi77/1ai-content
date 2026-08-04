"""Interactive / branching-video manifest builder.

Pure-python: no subprocess, no network. Builds a deterministic, JSON-serializable
``interactive/v1`` manifest describing a branching choice graph of video nodes. The
manifest is a contract consumed by a player/frontend; this engine never renders media.

Every public method returns a plain dict beginning with ``success: bool``.
"""
import json
import os
import tempfile

_MANIFEST_FILENAME = "manifest.json"


class InteractiveEngine:
    """Validate and build interactive branching-video manifests."""

    def validate_graph(self, start_id: str, nodes: list) -> list:
        """Return a list of validation error strings.

        ``nodes`` is a list of dicts ``{id, text, choices: list[str], media?}``.
        Returns ``[]`` when the graph is valid, else human-readable error strings:
        duplicate node ids, unknown start_id, dangling choice targets, and nodes
        unreachable from ``start_id`` via BFS over ``choices``.
        """
        errors: list = []

        node_ids = [n["id"] for n in nodes]
        by_id = {}
        for n in nodes:
            if n["id"] in by_id:
                errors.append(f"duplicate node id: {n['id']}")
            by_id[n["id"]] = n

        if not node_ids:
            errors.append("graph must contain at least one node")
            return errors

        if start_id not in node_ids:
            errors.append(f"start_id {start_id!r} is not among node ids")

        all_ids = set(node_ids)
        for n in nodes:
            for target in n.get("choices") or []:
                if target not in all_ids:
                    errors.append(
                        f"choice target {target!r} (from node {n['id']!r}) is not among node ids"
                    )

        # Reachability BFS from start_id over choices (only when start_id is known
        # and the graph has at least one node, to avoid duplicate/unreachable noise).
        if start_id in all_ids:
            seen = set()
            stack = [start_id]
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                for target in by_id.get(cur, {}).get("choices") or []:
                    if target in all_ids and target not in seen:
                        stack.append(target)
            unreachable = sorted(all_ids - seen)
            for nid in unreachable:
                errors.append(f"node {nid!r} is unreachable from start_id {start_id!r}")

        return errors

    def build(self, title: str, start_id: str, nodes: list, output_dir: str = None) -> dict:
        """Validate the graph and write ``manifest.json``.

        On validation failure returns ``{"success": False, "errors": [...]}``. Else
        writes the manifest into ``output_dir`` (or a fresh ``/tmp/interactive_*``
        tempdir when ``None``) and returns ``{success, manifest_path, title,
        nodes: N, reachable: N}``.
        """
        errors = self.validate_graph(start_id, nodes)
        if errors:
            return {"success": False, "errors": errors}

        reachable = self._reachable_count(start_id, nodes)

        if output_dir is None:
            tmp = tempfile.mkdtemp(prefix="interactive_")
            output_dir = tmp
        else:
            os.makedirs(output_dir, exist_ok=True)

        manifest = {
            "format": "interactive/v1",
            "title": title,
            "start_id": start_id,
            "nodes": nodes,
        }
        manifest_path = os.path.join(output_dir, _MANIFEST_FILENAME)
        with open(manifest_path, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)

        return {
            "success": True,
            "manifest_path": manifest_path,
            "title": title,
            "nodes": len(nodes),
            "reachable": reachable,
        }

    @staticmethod
    def _reachable_count(start_id: str, nodes: list) -> int:
        by_id = {n["id"]: n for n in nodes}
        seen = set()
        stack = [start_id] if start_id in by_id else []
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            for target in by_id.get(cur, {}).get("choices") or []:
                if target in by_id and target not in seen:
                    stack.append(target)
        return len(seen)