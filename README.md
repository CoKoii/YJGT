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
  domain/                 领域模型投影与组合账本计算
  constants/              常量与默认值
  services/               外部接口与本地持久化
  stores/                 Pinia 状态中心
  utils/                  纯函数工具
  types.ts                统一领域模型
```

## 数据模型

本地持久化只保存源数据：

- `funds`：基金代码与名称
- `positions`：每只基金、每个账户的持仓快照、收益快照、基准净值
- `operations`：买入、卖出、转换流水
- `navHistory`：每只基金的每日净值

总收益、当日收益、收益率、持仓占比、趋势图数据都由 `src/domain/portfolio.ts` 实时派生，不再作为主数据落盘。

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
