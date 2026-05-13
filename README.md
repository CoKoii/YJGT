# 跟投助手

`跟投助手` 保留跟投管理的工作台外观，但把业务核心改成源事件账本，避免把当前持仓、收益率、历史曲线这类派生数据重复落盘。

## 设计原则

- 只持久化必要源数据：`settings`、`funds`、`events`、`navHistory`。
- 当前持仓、投入金额、收益、收益率、仓位占比、历史曲线全部由 `src/domain/portfolio.ts` 即时投影。
- 截图快照只保存真实持仓金额和收益；份额可由净值缓存派生展示，但不作为源数据重复落盘。
- 买入、卖出、转换先记录为待结算操作；当交易日净值同步到本地后，投影层自动结算并流转金额与份额。
- 当前持仓卖空后自然从列表消失，历史事件仍保留。转换会减少转出基金份额，并新增或增加转入基金持仓。
- AI 截图识别写入 `holding_snapshot` 源事件；AI 问答只读取当前投影摘要，不会改写账本。

## 源数据模型

`PortfolioEvent` 分两类：

- `holding_snapshot`：真实持仓快照，来自手工录入或截图识别结果。可只包含金额和收益；份额由最新净值派生展示。
- `trade`：买入、卖出、转换操作，包含 `pending` 与 `settled` 两种状态。待结算操作保存用户真实录入的金额或份额，成交净值、成交份额、成交金额由交易日净值结算得到。

净值历史 `navHistory` 只缓存外部基金净值点。交易和快照自带的确认净值会作为真实源数据参与投影，但不会生成额外派生快照。

## 目录

```text
src/
  components/       工作台 UI 组件
  constants/        常量与默认配置
  domain/           账本投影与交易流转
  services/         本地持久化与基金接口
  stores/           Pinia 状态入口
  types/            领域类型
  utils/            日期、数字、文件工具
```

## 开发

```sh
pnpm --dir YJGT install
pnpm --dir YJGT dev
pnpm --dir YJGT type-check
pnpm --dir YJGT build
```
