-- 002_rls_policies.sql: Row Level Security for Multi-tenant & Individual Access
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Analyses Policies
CREATE POLICY "analyses_select_own" ON public.analyses
  FOR SELECT USING (
    user_id = auth.uid() OR
    (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = analyses.organization_id AND om.user_id = auth.uid()
    ))
  );

CREATE POLICY "analyses_insert_own" ON public.analyses
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    (organization_id IS NULL OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = analyses.organization_id AND om.user_id = auth.uid()
    ))
  );

-- Production Profiles Policies
CREATE POLICY "production_profiles_select_own" ON public.production_profiles
  FOR SELECT USING (
    user_id = auth.uid() OR
    (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = production_profiles.organization_id AND om.user_id = auth.uid()
    ))
  );

CREATE POLICY "production_profiles_insert_own" ON public.production_profiles
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    (organization_id IS NULL OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = production_profiles.organization_id AND om.user_id = auth.uid()
    ))
  );

CREATE POLICY "production_profiles_update_own" ON public.production_profiles
  FOR UPDATE USING (
    user_id = auth.uid() AND
    (organization_id IS NULL OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = production_profiles.organization_id AND om.user_id = auth.uid()
    ))
  );

-- Usage Records Policies
CREATE POLICY "usage_records_select_own" ON public.usage_records
  FOR SELECT USING (
    user_id = auth.uid() OR
    (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = usage_records.organization_id AND om.user_id = auth.uid()
    ))
  );

CREATE POLICY "usage_records_insert_own" ON public.usage_records
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    (organization_id IS NULL OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = usage_records.organization_id AND om.user_id = auth.uid()
    ))
  );
