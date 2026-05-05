# YJGT

一个基于 Vue 3 + Pinia + Ant Design Vue 的基金跟投管理工具，支持：

- 持仓录入、编辑、删除
- 博主 / 我的预算与跟投比例计算
- 买入、卖出、转换操作记录
- 基金详情走势查看
- AI 持仓截图识别
- AI 组合问答
- JSON / CSV 导出

## 项目结构

```text
src/
  components/dashboard/   页面组件与弹窗
  composables/            页面级业务编排
  constants/              常量与默认值
  services/               外部接口与本地持久化
  stores/                 Pinia 状态中心
  utils/                  纯函数工具
  types.ts                统一领域模型
```

## 本地开发

```sh
pnpm install
pnpm dev
```

## 校验与构建

```sh
pnpm type-check
pnpm build
pnpm lint
```

## 自动部署

项目已配置 GitHub Actions 自动部署到 GitHub Pages：

- 推送到 `main` 分支后会自动执行类型检查、构建并发布
- 也支持在 GitHub Actions 页面手动触发部署

首次使用时，需要在 GitHub 仓库设置中确认：

- `Settings -> Pages -> Build and deployment`
- `Source` 选择 `GitHub Actions`
