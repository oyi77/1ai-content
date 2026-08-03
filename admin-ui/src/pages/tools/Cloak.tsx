import { useState, FormEvent } from "react";
import { Input, Select, Button, Spinner } from "../../components/UI";
import { checkCloakProfile, cloakPost } from "../../api/client";

export default function Cloak() {
  const [profileId, setProfileId] = useState("");
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState("");

  const [postProfileId, setPostProfileId] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [caption, setCaption] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState("");
  const [postErr, setPostErr] = useState("");

  const handleCheck = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setCheckErr("");
    setStatus(null);
    try {
      const res = await checkCloakProfile(profileId);
      setStatus(res);
    } catch (err: unknown) {
      setCheckErr(String(err));
    } finally {
      setChecking(false);
    }
  };

  const handlePost = async (e: FormEvent) => {
    e.preventDefault();
    setPosting(true);
    setPostResult("");
    setPostErr("");
    try {
      const res = await cloakPost({ profile_id: postProfileId, platform, caption, media_path: mediaPath });
      if (res.success) setPostResult("Post submitted successfully!");
      else setPostErr(res.error || "Post failed");
    } catch (err: unknown) {
      setPostErr(String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4">CloakBrowser — Check Profile</h2>
        <form onSubmit={handleCheck} className="space-y-3 max-w-md">
          <Input
            label="Profile ID"
            name="profileId"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" loading={checking}>
            Check Status
          </Button>
        </form>
        {checkErr && <p className="text-red-400 mt-2">{checkErr}</p>}
        {status && (
          <pre className="mt-2 p-3 bg-gray-800 rounded text-sm overflow-auto max-h-64">
            {JSON.stringify(status, null, 2)}
          </pre>
        )}
      </div>

      <hr className="border-gray-700" />

      <div>
        <h2 className="text-xl font-bold mb-4">CloakBrowser — Post</h2>
        <form onSubmit={handlePost} className="space-y-3 max-w-md">
          <Input
            label="Profile ID"
            name="postProfileId"
            value={postProfileId}
            onChange={(e) => setPostProfileId(e.target.value)}
            required
          />
          <Select
            label="Platform"
            name="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={[
              { value: "instagram", label: "Instagram" },
              { value: "facebook", label: "Facebook" },
              { value: "tiktok", label: "TikTok" },
              { value: "twitter", label: "Twitter / X" },
            ]}
          />
          <Input
            label="Caption"
            name="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            required
          />
          <Input
            label="Media Path (optional)"
            name="mediaPath"
            value={mediaPath}
            onChange={(e) => setMediaPath(e.target.value)}
            placeholder="/data/videos/example.mp4"
          />
          <Button type="submit" variant="primary" loading={posting}>
            Submit Post
          </Button>
        </form>
        {postResult && <p className="text-green-400 mt-2">{postResult}</p>}
        {postErr && <p className="text-red-400 mt-2">{postErr}</p>}
      </div>
    </div>
  );
}
