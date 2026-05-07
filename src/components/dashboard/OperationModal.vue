<script setup lang="ts">
import { computed } from 'vue'
import type { InvestorSide, OperationFormModel } from '@/types'

const props = defineProps<{
  open: boolean
  form: OperationFormModel
  formatNumber: (value: number) => string
  title: string
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: OperationFormModel): void
  (event: 'save'): void
  (event: 'sync-my-amount'): void
  (event: 'set-ratio', owner: InvestorSide, ratio: number): void
  (event: 'fill-target-name'): void
}>()

const AMOUNT_RATIOS = [
  { label: '1/4', value: 1 / 4 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 1 / 2 },
  { label: '全部', value: 1 },
]

const amountFields = [
  { key: 'blogger', label: '博主金额', formKey: 'bloggerAmount' as const },
  { key: 'mine', label: '我的金额', formKey: 'myAmount' as const },
]

const amountFieldsForExit = computed(() => {
  const actionText = props.form.type === 'sell' ? '卖出' : '转出'

  return [
    {
      key: 'blogger',
      owner: 'blogger' as const,
      label: `博主${actionText}份额`,
      formKey: 'bloggerAmount' as const,
    },
    {
      key: 'mine',
      owner: 'mine' as const,
      label: `我的${actionText}份额`,
      formKey: 'myAmount' as const,
    },
  ]
})

function updateFormField(field: keyof OperationFormModel, value: string | number) {
  emit('update:form', { ...props.form, [field]: value })
}
</script>

<template>
  <a-modal
    :open="open"
    centered
    :title="title"
    width="560px"
    wrap-class-name="operation-modal"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="emit('update:open', $event)"
    @ok="emit('save')"
  >
    <a-form layout="vertical" class="operation-form">
      <a-row :gutter="[20, 20]">
        <template v-if="props.form.type === 'buy'">
          <a-col v-for="item in amountFields" :key="item.key" :span="12">
            <a-form-item :label="item.label" class="operation-field">
              <a-input-number
                :value="props.form[item.formKey]"
                :min="0"
                :precision="2"
                class="operation-amount-input"
                addon-before="¥"
                @update:value="updateFormField(item.formKey, Number($event ?? 0))"
                @change="item.key === 'blogger' ? emit('sync-my-amount') : undefined"
              />
            </a-form-item>
          </a-col>
        </template>
        <template v-if="props.form.type !== 'buy'">
          <a-col v-for="item in amountFieldsForExit" :key="item.key" :span="12">
            <a-form-item :label="item.label" class="operation-field">
              <div class="operation-share-panel">
                <a-space wrap class="operation-share-actions">
                  <a-button
                    v-for="ratio in AMOUNT_RATIOS"
                    :key="ratio.label"
                    @click="emit('set-ratio', item.owner, ratio.value)"
                  >
                    {{ ratio.label }}
                  </a-button>
                </a-space>
                <a-input-number
                  :value="props.form[item.formKey]"
                  :min="0"
                  :precision="2"
                  addon-after="份"
                  placeholder="手动输入份额"
                  class="operation-share-input"
                  @update:value="updateFormField(item.formKey, Number($event ?? 0))"
                />
              </div>
            </a-form-item>
          </a-col>
        </template>
        <template v-if="props.form.type === 'convert'">
          <a-col :span="12">
            <a-form-item label="转入基金代码" class="operation-field">
              <a-input
                :value="props.form.toFundCode"
                :maxlength="6"
                placeholder="输入 6 位基金代码"
                @update:value="updateFormField('toFundCode', $event)"
                @blur="emit('fill-target-name')"
                @press-enter="emit('fill-target-name')"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="转入基金名称" class="operation-field">
              <a-input
                :value="props.form.toFundName"
                placeholder="输入代码后自动带出，也可以手动填写"
                @update:value="updateFormField('toFundName', $event)"
              />
            </a-form-item>
          </a-col>
        </template>
      </a-row>
    </a-form>
  </a-modal>
</template>

<style scoped>
.operation-form :deep(.ant-form-item) {
  margin-bottom: 0;
}

.operation-form :deep(.ant-form-item-label) {
  padding-bottom: 8px;
}

.operation-form :deep(.ant-form-item-label > label) {
  color: var(--text-main);
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.operation-form :deep(.ant-input),
.operation-form :deep(.ant-input-affix-wrapper) {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
}

.operation-form :deep(.ant-input-number) {
  width: 100%;
}

.operation-share-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.operation-estimate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--surface-soft);
}

.operation-estimate-label {
  color: var(--text-muted);
  font-size: 13px;
}

.operation-estimate-value {
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 600;
}

.operation-share-actions {
  display: flex;
  width: 100%;
}

.operation-share-actions :deep(.ant-space-item) {
  flex: 1;
}

.operation-share-actions :deep(.ant-btn) {
  width: 100%;
  height: 36px;
  padding: 0;
  border-radius: 10px;
  font-weight: 500;
}

.operation-share-input {
  width: 100%;
}

.operation-amount-input {
  width: 100%;
}

:global(.operation-modal .ant-modal-header) {
  margin-bottom: 20px;
}

:global(.operation-modal .ant-modal-body) {
  padding-top: 12px;
}
</style>
