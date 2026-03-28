import { Input, Button } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { useState } from "react";

export default function PromptInput({ onSubmit, loading, placeholder, autoFocus }) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={handleSubmit}
        placeholder={placeholder ?? "Try /expand or /whatif, or simply ask…"}
        size="large"
        disabled={loading}
        autoFocus={autoFocus}
        style={{ borderRadius: 8 }}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        size="large"
        onClick={handleSubmit}
        loading={loading}
        style={{ borderRadius: 8, minWidth: 48 }}
      />
    </div>
  );
}
