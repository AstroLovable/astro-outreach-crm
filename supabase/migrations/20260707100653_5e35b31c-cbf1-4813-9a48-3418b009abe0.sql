CREATE TABLE public.deletion_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.deletion_verification_codes TO service_role;
ALTER TABLE public.deletion_verification_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_dvc_user_created ON public.deletion_verification_codes(user_id, created_at DESC);