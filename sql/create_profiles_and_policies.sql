-- create_profiles_and_policies.sql
-- تم تحديث هذا الملف لتعيين المستخدم صاحب UID التالي كأدمن مباشرةً.
-- إذا رغبت تغيّر البريد أو القيم الأخرى، حرّر الملف قبل التنفيذ في لوحة Supabase.

-- NOTE: استبدال هذا الملف في الفرع لا ينشر مفاتيح سرية لأي مكان.

-- 1) جدول profiles (إن لم يكن موجودًا)
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- 2) أدخل/حدّث سجل الأدمن مباشرةً باستخدام الـ UID الذي زوّدته
-- استبدل القيمة أدناه إذا أردت تعيين مستخدم آخر.

insert into public.profiles (id, email, is_admin)
values ('c8b87bb2-dacc-4e26-82a7-34c22162eb85', NULL, true)
on conflict (id) do update set email = coalesce(public.profiles.email, excluded.email), is_admin = true;

-- 3) تفعيل RLS على products و orders (إن وُجدا)
alter table if exists public.products enable row level security;
alter table if exists public.orders enable row level security;

-- سياسة قراءة عامة على المنتجات
create policy if not exists products_select_public on public.products
  for select
  using ( true );

-- سياسة وصول كاملة للأدمن على المنتجات
create policy if not exists products_admin_full on public.products
  for all
  using ( exists ( select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true ))
  with check ( exists ( select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true ));

-- السماح للمستخدمين المسجلين بإدخال أوامر
create policy if not exists orders_insert_authenticated on public.orders
  for insert
  with check ( auth.role() = 'authenticated' );

-- السماح للأدمن بقراءة/حذف الطلبات
create policy if not exists orders_read_delete_admin on public.orders
  for select, delete
  using ( exists ( select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true ));
