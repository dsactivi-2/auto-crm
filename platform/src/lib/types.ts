export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  action: string;
  module: string;
  details: Record<string, unknown>;
  status: "success" | "error" | "pending";
  error_message?: string;
  duration_ms?: number;
  created_at: string;
  // Joined
  profiles?: { full_name: string; email: string };
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CrmCredentials {
  id: string;
  user_id: string;
  crm_username: string;
  crm_password_encrypted: string;
  crm_url: string;
  is_valid: boolean | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}
