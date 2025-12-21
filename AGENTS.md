## 项目速览
- **定位**：题库前端（Next.js App Router）+ Supabase 数据。功能涵盖题目浏览、学科/章节筛选、收藏题目、记录查看答案、后台学科/用户授权管理。
- **核心页面**：
  - `/questions`：筛选（学科/章节、难度），渲染 QuestionCard，支持分页、书签状态、答案查看指示，全屏查看题/答双栏或单栏切换。
  - `/account`：标签切换“收藏 / 已查看答案”，用 QuestionCard 展示，显示收藏时间。
  - `/console/*`：后台管理（subjects/chapters、users）。users 支持为用户勾选可访问的 subjects（实时 upsert 到 user_subject_access）。

## 主要数据与权限
- **Supabase 表**：
  - `subjects` / `chapters` / `questions` / `question_images` / `answer_images`.
  - `user_subject_access`：用户-学科访问映射。RLS 限制非 admin/super_admin 只能看/操作自己的授权；查询 subjects/chapters/questions 也依赖此表。
  - `user_questions`：用户对题目的状态（收藏 is_bookmarked、answer_viewed_at / answer_view_count、last_viewed_at 等）。
- **RLS 与函数**：
  - `track_answer_view(q_id bigint)`：记录答案查看时间与次数（upsert 当前用户）。
  - RLS 在初始迁移与 `20251207232129_add_user_subject_access.sql` 中定义/收紧，subjects/chapters/questions 仅对管理员或有 user_subject_access 的用户可见。

## 前端实现要点
- **QuestionCard**：支持书签切换、答案查看记录、难度/分值显示，支持全屏；全屏模式提供 Question/Answer 切换（至少一个选中，默认 Question）。
- **Question API** `/api/questions`：返回题目列表并附带 `isBookmarked`、`isAnswerViewed`，签名题目/答案图片 URL。
- **Account**：一次查询 user_questions + questions，传递状态给 QuestionCard。
- **Console Users**：服务端查询 profiles、subjects、user_subject_access，客户端勾选学科授权（upsert/delete）。

## 代码与风格
- **技术栈**：Next.js App Router，Supabase 客户端（server/client 分离），Tailwind 风格类名。格式化/lint 使用 `biome`。
- **UI 风格**：圆角、浅色底、淡边框、柔和蓝/灰主色；按钮 hover 轻量阴影，标签/胶囊式切换控件。

## 开发与验证
- **Lint/格式**：`yarn lint src`（Biome）。
- **改动后必做**：每次修改完成后依次运行 `yarn format src`、`yarn lint src`，然后用 Next.js MCP 的 `get_errors` 检查是否有报错。
- **权限/数据验证**：运行 Supabase 迁移（`supabase db reset` 或 migrate），确认 RLS 生效；使用普通用户验证 subject/章节/题目过滤。
- **功能验证**：题卡全屏切换、书签状态同步、Mark Scheme 点击写入答案查看；账号页收藏/已查看列表；后台授权勾选生效后刷新题库过滤。
- **MCP 工具**（Next.js 服务器已启用 MCP，端口 3000）：
  - `get_errors`：查看当前编译/运行时错误。
  - `get_routes`：路由列表。
  - `get_page_metadata` / `get_project_metadata` / `get_logs` / `get_server_action_by_id`：项目元信息、日志与服务端动作定位。
- **Supabase 迁移规范**：新增数据库迁移时，使用 `yarn supabase migration new <name>` 生成迁移文件，再按需求编辑。
