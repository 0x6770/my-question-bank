# Paper Generator 实施计划

## 项目概述

在当前 Next.js + Supabase 项目中实现类似旧系统的 Paper Generator 功能，支持：
- 多条件组合查询（最多3个查询条件）
- 随机抽取题目（每个条件1-5道题）
- 自动去重
- 显示/隐藏答案
- PDF 生成与下载

---

## 阶段 1: MVP (最小可行产品)

### ✅ 1.1 数据库设计与迁移

#### 任务清单
- [ ] 创建 `exam_papers` 表
  ```sql
  CREATE TABLE exam_papers (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    title TEXT NOT NULL DEFAULT 'Worksheet',
    question_bank TEXT NOT NULL,
    show_answers BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] 创建 `paper_questions` 表
  ```sql
  CREATE TABLE paper_questions (
    id BIGSERIAL PRIMARY KEY,
    paper_id BIGINT REFERENCES exam_papers ON DELETE CASCADE,
    question_id BIGINT REFERENCES questions ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(paper_id, question_id)
  );
  ```

- [ ] 创建 `user_paper_quotas` 表
  ```sql
  CREATE TABLE user_paper_quotas (
    user_id UUID PRIMARY KEY REFERENCES auth.users,
    papers_generated INTEGER DEFAULT 0,
    quota_reset_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] 添加 RLS 策略
  - [ ] exam_papers 表：用户只能查看/修改自己的试卷
  - [ ] paper_questions 表：通过 paper_id 关联权限
  - [ ] user_paper_quotas 表：用户只能查看自己的配额

- [ ] 运行迁移并验证
  ```bash
  cd supabase
  supabase migration new add_paper_generator_tables
  # 编辑迁移文件
  supabase db push
  ```

- [ ] 更新 `database.types.ts`
  ```bash
  supabase gen types typescript --local > database.types.ts
  ```

---

### ✅ 1.2 API 路由实现

#### 1.2.1 随机题目查询 API
**文件**: `src/app/api/papers/random-questions/route.ts`

- [ ] 创建 POST endpoint
- [ ] 实现参数解析
  ```typescript
  interface RandomQuestionsRequest {
    questionBank: QuestionBank;
    queries: Array<{
      subjectId?: number;
      chapterId?: number;
      difficulty?: number;
      calculator?: boolean;
      minMarks?: number;
      maxMarks?: number;
      sample: number; // 1-5
    }>;
  }
  ```

- [ ] 实现查询逻辑
  - [ ] 遍历每个查询条件（最多3个）
  - [ ] 构建 Supabase 查询（过滤条件）
  - [ ] 排除已选题目（去重）
  - [ ] 随机抽样
  - [ ] 合并结果

- [ ] 返回题目列表（不含答案图片）
  ```typescript
  interface QuestionSummary {
    id: number;
    difficulty: number;
    calculator: boolean;
    marks: number;
    question_images: Array<{
      id: number;
      storage_path: string;
      position: number;
    }>;
  }
  ```

- [ ] 错误处理
  - [ ] 参数验证
  - [ ] 数据库错误
  - [ ] 认证错误

#### 1.2.2 试卷生成权限验证 API
**文件**: `src/app/api/papers/generate/route.ts`

- [ ] 创建 POST endpoint
- [ ] 实现用户认证检查
- [ ] 实现配额检查逻辑
  - [ ] 获取用户配额记录
  - [ ] 检查是否需要重置（30天周期）
  - [ ] 检查是否超限
    - 免费用户: 5份/月
    - 付费用户: 50份/月

- [ ] 创建试卷记录
  ```typescript
  interface GeneratePaperRequest {
    title: string;
    questionIds: number[];
    questionBank: QuestionBank;
    showAnswers: boolean;
  }
  ```

- [ ] 创建 paper_questions 关联
- [ ] 更新配额计数
- [ ] 获取完整题目信息（含答案图片）
- [ ] 返回结果
  ```typescript
  interface GeneratePaperResponse {
    success: boolean;
    paperId?: number;
    questions?: QuestionWithAnswers[];
    error?: string;
  }
  ```

#### 1.2.3 试卷详情查询 API
**文件**: `src/app/api/papers/[id]/route.ts`

- [ ] 创建 GET endpoint
- [ ] 验证用户权限（只能查看自己的试卷）
- [ ] 查询试卷基本信息
- [ ] 查询关联的题目（按 position 排序）
- [ ] 获取题目完整信息（含答案图片）
- [ ] 返回结果

---

### ✅ 1.3 前端页面开发

#### 1.3.1 Paper Builder 主页面
**文件**: `src/app/console/papers/builder/page.tsx`

- [ ] 创建页面文件和路由
- [ ] 实现页面布局
  ```tsx
  <div className="container">
    <PageHeader title="Paper Generator" />
    <QueryBuilder />
    <QuestionList />
    <PaperOptions />
    <ActionButtons />
  </div>
  ```

- [ ] 添加到 console 导航菜单
  - [ ] 更新 `app-navbar-client.tsx`
  - [ ] 添加 "Papers" 链接

#### 1.3.2 QueryBuilder 组件
**文件**: `src/components/paper-builder/query-builder.tsx`

- [ ] 创建组件骨架
- [ ] 实现状态管理
  ```typescript
  interface QueryCondition {
    id: string;
    subjectId?: number;
    chapterId?: number;
    difficulty?: number;
    calculator?: boolean;
    minMarks?: number;
    maxMarks?: number;
    sample: number; // 默认 1
  }
  ```

- [ ] 实现添加/删除查询条件（最多3个）
- [ ] 实现单个条件配置
  - [ ] Subject 下拉选择
  - [ ] Chapter 下拉选择（基于 subject）
  - [ ] Difficulty 选择（1-4）
  - [ ] Calculator 复选框
  - [ ] Marks 范围输入
  - [ ] Sample 数量选择（1-5）

- [ ] 实现 "Shuffle" 按钮
  - [ ] 调用 `/api/papers/random-questions`
  - [ ] 加载状态显示
  - [ ] 错误处理

#### 1.3.3 QuestionList 组件
**文件**: `src/components/paper-builder/question-list.tsx`

- [ ] 创建组件骨架
- [ ] 实现题目列表显示
  - [ ] 使用简略卡片视图
  - [ ] 显示题目编号、难度、分数、计算器
  - [ ] 显示第一张题目图片（缩略图）

- [ ] 实现题目操作
  - [ ] 删除单个题目
  - [ ] 清空所有题目
  - [ ] 题目排序（上移/下移）

- [ ] 显示题目统计
  - [ ] 总题目数
  - [ ] 总分数

#### 1.3.4 PaperOptions 组件
**文件**: `src/components/paper-builder/paper-options.tsx`

- [ ] 创建组件
- [ ] 实现配置选项
  - [ ] 试卷标题输入框（默认 "Worksheet"）
  - [ ] Show Answers 切换开关
  - [ ] Question Bank 显示（只读）

#### 1.3.5 ActionButtons 组件
**文件**: `src/components/paper-builder/action-buttons.tsx`

- [ ] 创建组件
- [ ] 实现 "Generate PDF" 按钮
  - [ ] 调用 `/api/papers/generate`
  - [ ] 加载状态
  - [ ] 权限验证
  - [ ] 成功后触发 PDF 生成

- [ ] 禁用状态逻辑
  - [ ] 题目列表为空时禁用
  - [ ] 生成中禁用

---

### ✅ 1.4 PDF 生成功能

#### 1.4.1 安装依赖
- [ ] 安装 react-to-print
  ```bash
  npm install react-to-print
  ```

#### 1.4.2 PDFGenerator 组件
**文件**: `src/components/paper-builder/pdf-generator.tsx`

- [ ] 创建组件
- [ ] 使用 useReactToPrint hook
  ```typescript
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `${title}_${Date.now()}`,
    onBeforePrint: () => console.log('Printing...'),
    onAfterPrint: () => console.log('Done'),
  });
  ```

- [ ] 实现打印内容渲染
  - [ ] 试卷标题
  - [ ] 题目列表
    - [ ] 题目编号
    - [ ] 题目元数据（难度、分数、计算器）
    - [ ] 题目图片
    - [ ] 答案图片（根据 showAnswers）

- [ ] 实现打印样式
  - [ ] 使用 Tailwind print: 修饰符
  - [ ] A4 纸张大小适配
  - [ ] 分页控制（避免题目跨页）
  - [ ] 页边距设置

- [ ] 隐藏打印内容（仅在打印时显示）
  ```tsx
  <div className="hidden print:block">
    {/* 打印内容 */}
  </div>
  ```

#### 1.4.3 集成到 ActionButtons
- [ ] 在 ActionButtons 中使用 PDFGenerator
- [ ] 实现两步流程
  1. 点击 "Generate PDF" → 调用 API 获取完整题目
  2. 自动触发 handlePrint() → 浏览器打印对话框

---

### ✅ 1.5 测试与验证

#### 数据库测试
- [ ] 验证表创建成功
- [ ] 验证 RLS 策略生效
- [ ] 测试插入/查询数据

#### API 测试
- [ ] 测试 `/api/papers/random-questions`
  - [ ] 单条件查询
  - [ ] 多条件查询
  - [ ] 去重功能
  - [ ] 边界情况（无结果、超限）

- [ ] 测试 `/api/papers/generate`
  - [ ] 权限验证
  - [ ] 配额检查
  - [ ] 试卷创建
  - [ ] 题目关联

- [ ] 测试 `/api/papers/[id]`
  - [ ] 查询试卷
  - [ ] 权限验证

#### 前端测试
- [ ] 测试 QueryBuilder
  - [ ] 添加/删除查询条件
  - [ ] 各个筛选器功能
  - [ ] Shuffle 功能

- [ ] 测试 QuestionList
  - [ ] 题目显示
  - [ ] 删除/排序功能

- [ ] 测试 PDF 生成
  - [ ] 打印对话框弹出
  - [ ] 打印预览正确
  - [ ] 答案显示/隐藏

#### 集成测试
- [ ] 完整流程测试
  1. 添加查询条件
  2. 获取随机题目
  3. 调整题目顺序
  4. 配置选项
  5. 生成 PDF
  6. 验证输出

- [ ] 配额限制测试
  - [ ] 免费用户限制
  - [ ] 付费用户限制
  - [ ] 配额重置

---

## 阶段 2: 功能完善

### ✅ 2.1 题目预览优化

- [ ] 创建题目详情预览组件
  - [ ] Modal 对话框
  - [ ] 显示完整题目图片
  - [ ] 显示题目元数据

- [ ] 在 QuestionList 中添加预览按钮
- [ ] 实现图片放大查看

---

### ✅ 2.2 试卷历史记录

#### 2.2.1 试卷列表页面
**文件**: `src/app/console/papers/page.tsx`

- [ ] 创建试卷历史页面
- [ ] 查询用户的所有试卷
- [ ] 显示试卷列表
  - [ ] 标题
  - [ ] 创建时间
  - [ ] 题目数量
  - [ ] Question Bank

- [ ] 实现操作
  - [ ] 查看试卷详情
  - [ ] 重新生成 PDF
  - [ ] 删除试卷

#### 2.2.2 试卷详情页面
**文件**: `src/app/console/papers/[id]/page.tsx`

- [ ] 创建详情页面
- [ ] 显示试卷信息
- [ ] 显示题目列表
- [ ] 提供 "Generate PDF" 按钮

---

### ✅ 2.3 用户配额显示

**文件**: `src/components/paper-builder/quota-display.tsx`

- [ ] 创建配额显示组件
- [ ] 查询用户配额信息
  - [ ] 本周期已生成数量
  - [ ] 配额限制
  - [ ] 重置日期

- [ ] 显示进度条
- [ ] 添加到 Paper Builder 页面

---

### ✅ 2.4 高级筛选功能

- [ ] 支持按年份筛选（如果数据中有）
- [ ] 支持按 timezone 筛选
- [ ] 支持按 paper/season 筛选
- [ ] 保存常用筛选条件

---

### ✅ 2.5 UI/UX 优化

- [ ] 添加加载骨架屏
- [ ] 优化错误提示
  - [ ] Toast 通知
  - [ ] 详细错误信息

- [ ] 添加空状态提示
  - [ ] 无题目时的占位符
  - [ ] 引导用户操作

- [ ] 响应式设计
  - [ ] 移动端适配
  - [ ] 平板适配

- [ ] 添加键盘快捷键
  - [ ] Ctrl+S: 生成 PDF
  - [ ] Delete: 删除选中题目

---

## 阶段 3: 高级功能

### ✅ 3.1 真正的 PDF 文件导出

#### 3.1.1 安装依赖
- [ ] 安装 jsPDF 和 html2canvas
  ```bash
  npm install jspdf html2canvas
  ```

#### 3.1.2 实现 PDF 导出
**文件**: `src/components/paper-builder/pdf-exporter.tsx`

- [ ] 创建组件
- [ ] 实现 HTML to PDF 转换
  ```typescript
  const generatePDF = async () => {
    const element = printRef.current;
    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF();
    pdf.addImage(imgData, 'PNG', 0, 0);
    pdf.save(`${title}_${Date.now()}.pdf`);
  };
  ```

- [ ] 优化 PDF 输出质量
  - [ ] 调整分辨率
  - [ ] 处理分页
  - [ ] 图片压缩

- [ ] 添加 "Download PDF" 按钮
- [ ] 与 "Print PDF" 并存

---

### ✅ 3.2 试卷分享功能

#### 3.2.1 生成分享链接
- [ ] 创建公开访问的试卷页面
  - [ ] `/papers/public/[shareId]`
  - [ ] 不需要登录即可访问

- [ ] 实现分享链接生成
  - [ ] 生成唯一 shareId（UUID）
  - [ ] 保存到数据库
  - [ ] 设置过期时间（可选）

- [ ] 添加分享按钮
  - [ ] 复制链接
  - [ ] 二维码生成

#### 3.2.2 公开页面实现
- [ ] 创建公开访问页面
- [ ] 显示试卷内容
- [ ] 提供 PDF 下载
- [ ] 权限验证（过期检查）

---

### ✅ 3.3 智能推荐

- [ ] 分析用户历史
  - [ ] 常做章节
  - [ ] 常做难度

- [ ] 实现推荐算法
  - [ ] 基于历史的题目推荐
  - [ ] 错题重做推荐

- [ ] 添加 "Smart Shuffle" 功能
  - [ ] 自动填充推荐条件
  - [ ] 一键生成推荐试卷

---

### ✅ 3.4 批量操作

- [ ] 批量生成试卷
  - [ ] 相同条件生成多份
  - [ ] 题目不重复

- [ ] 批量导出
  - [ ] 打包下载多份试卷
  - [ ] ZIP 格式

---

### ✅ 3.5 管理员功能

#### 3.5.1 配额管理
**文件**: `src/app/console/admin/quotas/page.tsx`

- [ ] 创建管理员页面
- [ ] 查看所有用户配额
- [ ] 手动调整配额
- [ ] 重置用户配额

#### 3.5.2 使用统计
**文件**: `src/app/console/admin/stats/page.tsx`

- [ ] 试卷生成统计
  - [ ] 总数
  - [ ] 按日期分组
  - [ ] 按用户分组

- [ ] 热门题目统计
- [ ] 导出统计报表

---

## 技术债务与优化

### ✅ 性能优化

- [ ] 实现题目缓存
  - [ ] React Query 缓存策略
  - [ ] 减少重复请求

- [ ] 优化随机查询
  - [ ] 数据库索引优化
  - [ ] 查询性能分析

- [ ] 图片优化
  - [ ] 懒加载
  - [ ] 图片压缩
  - [ ] CDN 加速

- [ ] 代码分割
  - [ ] 动态导入 PDF 库
  - [ ] 减少初始加载体积

---

### ✅ 安全性增强

- [ ] 实现速率限制
  - [ ] API 请求频率限制
  - [ ] 防止恶意刷题

- [ ] 数据验证
  - [ ] 输入参数验证
  - [ ] SQL 注入防护
  - [ ] XSS 防护

- [ ] 审计日志
  - [ ] 记录试卷生成
  - [ ] 记录配额修改

---

### ✅ 测试完善

- [ ] 单元测试
  - [ ] API 路由测试
  - [ ] 组件测试

- [ ] 集成测试
  - [ ] E2E 测试流程
  - [ ] Playwright 测试

- [ ] 性能测试
  - [ ] 负载测试
  - [ ] 压力测试

---

## 部署检查清单

### 数据库
- [ ] 所有迁移已应用
- [ ] RLS 策略已启用
- [ ] 索引已创建
- [ ] 备份策略已设置

### 环境变量
- [ ] 生产环境变量已配置
- [ ] API 密钥已设置
- [ ] 数据库连接已验证

### 功能验证
- [ ] 所有功能正常工作
- [ ] 权限验证正常
- [ ] 配额限制生效
- [ ] PDF 生成正常

### 监控
- [ ] 错误追踪已启用
- [ ] 性能监控已配置
- [ ] 日志收集已设置

---

## 文档

- [ ] 用户使用文档
  - [ ] 如何生成试卷
  - [ ] 配额说明
  - [ ] 常见问题

- [ ] 开发者文档
  - [ ] API 文档
  - [ ] 数据库架构
  - [ ] 组件说明

- [ ] 管理员文档
  - [ ] 配额管理
  - [ ] 用户管理
  - [ ] 统计报表

---

## 进度追踪

**阶段 1 完成度**: 0/5 (0%)
- 数据库设计: ⬜
- API 路由: ⬜
- 前端页面: ⬜
- PDF 生成: ⬜
- 测试验证: ⬜

**阶段 2 完成度**: 0/5 (0%)

**阶段 3 完成度**: 0/5 (0%)

---

## 备注

- 优先完成阶段 1，确保核心功能可用
- 阶段 2 和 3 可根据实际需求调整优先级
- 每完成一个任务记得 ✅ 打勾
- 遇到问题及时记录在对应任务下方
