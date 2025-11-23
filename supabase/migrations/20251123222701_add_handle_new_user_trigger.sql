-- 0005_add_handle_new_user_trigger.sql

-- 防御式：如果之前有同名 trigger，就先删掉
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 新建 trigger：当 auth.users 有新纪录插入时，逐行执行 handle_new_user()
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
