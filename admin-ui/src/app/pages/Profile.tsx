import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      alert("New password must be at least 6 characters");
      return;
    }
    setPwdSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      alert("Password updated!");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPwdSaving(false);
    }
  };

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ name });
      await refreshUser();
      alert("Profile updated!");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20 }}>Profile</h2>

      <div className="card" style={{ maxWidth: 500 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Telegram ID
          </label>
          <input className="input" value={user?.telegramId || ""} disabled style={{ opacity: 0.6 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Username
          </label>
          <input className="input" value={user?.username || ""} disabled style={{ opacity: 0.6 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Display Name
          </label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Credits
          </label>
          <input className="input" value={user?.credits ?? 0} disabled style={{ opacity: 0.6 }} />
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <h2 className="card-title" style={{ fontSize: "1.25rem", marginBottom: 20, marginTop: 32 }}>
        Change Password
      </h2>

      <div className="card" style={{ maxWidth: 500 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            Current Password
          </label>
          <input
            className="input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#8888aa", fontSize: "0.85rem", marginBottom: 6 }}>
            New Password
          </label>
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>
        <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwdSaving}>
          {pwdSaving ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}