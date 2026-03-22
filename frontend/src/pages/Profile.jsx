import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Save, User } from "lucide-react";
import { getApiBaseUrl, getProfile, updateProfile, uploadAvatar } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");

  const avatarUrl = useMemo(() => {
    if (!profile?.avatar_filename) return null;
    const base = getApiBaseUrl();
    return `${base}/api/auth/profile/avatar/${encodeURIComponent(profile.avatar_filename)}`;
  }, [profile?.avatar_filename]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProfile();
      setProfile(data);
      setDisplayName(data.display_name || "");
      setEmail(data.email || "");
      setBio(data.bio || "");
    } catch (err) {
      setError(err?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateProfile({
        display_name: displayName,
        email,
        bio,
      });
      await refreshUser().catch(() => null);
      await load();
    } catch (err) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await uploadAvatar(file);
      await refreshUser().catch(() => null);
      await load();
    } catch (err) {
      setError(err?.message || "Failed to upload avatar");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-theme-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading profile...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
        <h1 className="text-3xl font-bold text-theme-primary">Profile</h1>
        <p className="mt-1 text-theme-muted">Update your details and upload a profile image.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Avatar</h2>
          <div className="mt-5 flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-theme-light bg-theme-secondary">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-theme-muted">
                  <User className="h-8 w-8" />
                </div>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-theme-light bg-theme-secondary px-4 py-2 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploading ? "Uploading..." : "Upload Image"}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>
          <p className="mt-3 text-xs text-theme-muted">Supported: any image format. Stored per user.</p>
        </section>

        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Details</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-theme-secondary">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
                placeholder={profile?.username || "Your name"}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-theme-secondary">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-theme-secondary">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
              placeholder="What are you working on?"
            />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-theme-inverse accent-primary hover:accent-hover disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
