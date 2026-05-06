<script setup lang="ts">
import { computed } from 'vue'
import type { HoldingFormModel } from '@/types'

const props = defineProps<{
  open: boolean
  form: HoldingFormModel
  isFundInfoLoading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: HoldingFormModel): void
  (event: 'save'): void
  (event: 'fill-name'): void
}>()

function updateFormField(field: keyof HoldingFormModel, value: string | number) {
  emit('update:form', { ...props.form, [field]: value })
}

const fundFields = [
  {
    key: 'fundCode',
    label: '基金代码',
    placeholder: '输入 6 位基金代码',
    maxLength: 6,
    autofill: true,
  },
  {
    key: 'fundName',
    label: '基金名称',
    placeholder: '输入代码后自动带出，也可以手动填写',
    maxLength: undefined,
    autofill: false,
  },
] as const

const holdingSections = computed(() => [
  {
    key: 'mine',
    title: '我的持仓',
    fields: [
      { key: 'myAmount' as const, label: '持有金额', min: 0 },
      { key: 'myProfit' as const, label: '持有收益' },
    ],
  },
  {
    key: 'blogger',
    title: '参考持仓',
    fields: [
      { key: 'bloggerAmount' as const, label: '持有金额', min: 0 },
      { key: 'bloggerProfit' as const, label: '持有收益' },
    ],
  },
])
</script>

<template>
  <a-modal
    :open="props.open"
    centered
    title="添加持仓"
    width="720px"
    wrap-class-name="holding-modal"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="emit('update:open', $event)"
    @ok="emit('save')"
  >
    <a-form layout="vertical" class="holding-form">
      <a-row :gutter="[20, 20]">
        <a-col :span="24">
          <div class="holding-section">
            <div class="holding-section-title">基金信息</div>
            <a-row :gutter="[20, 20]">
              <a-col v-for="item in fundFields" :key="item.key" :span="12">
                <a-form-item :label="item.label">
                  <a-input
                    :value="props.form[item.key]"
                    :maxlength="item.maxLength"
                    :placeholder="item.placeholder"
                    @update:value="updateFormField(item.key, $event)"
                    @blur="item.autofill ? emit('fill-name') : undefined"
                    @press-enter="item.autofill ? emit('fill-name') : undefined"
                  />
                    <template v-if="props.isFundInfoLoading" #suffix>
                      <a-spin size="small" />
                    </template>
                </a-form-item>
              </a-col>
            </a-row>
          </div>
        </a-col>
        <a-col v-for="section in holdingSections" :key="section.key" :span="12">
          <div class="holding-section">
            <div class="holding-section-title">{{ section.title }}</div>
            <a-row :gutter="[0, 18]">
              <a-col v-for="item in section.fields" :key="item.key" :span="24">
                <a-form-item :label="item.label">
                  <a-input-number
                    :value="props.form[item.key]"
                    :min="item.min"
                    :precision="2"
                    addon-before="¥"
                    @update:value="updateFormField(item.key, Number($event ?? 0))"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </div>
        </a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>

<style scoped>
.holding-form :deep(.ant-form-item) {
  margin-bottom: 0;
}

.holding-form :deep(.ant-form-item-label) {
  padding-bottom: 8px;
}

.holding-form :deep(.ant-form-item-label > label) {
  color: #172554;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.holding-form :deep(.ant-input),
.holding-form :deep(.ant-input-affix-wrapper) {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
}

.holding-form :deep(.ant-input-number) {
  width: 100%;
}

.holding-form :deep(.ant-input-number-group-wrapper) {
  width: 100%;
}

.holding-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.holding-section-title {
  color: #172554;
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
}

:global(.holding-modal .ant-modal-header) {
  margin-bottom: 20px;
}

:global(.holding-modal .ant-modal-body) {
  padding-top: 12px;
}
</style>
