<script setup lang="ts">
import type { HoldingFormModel } from '@/types'

defineProps<{
  open: boolean
  form: HoldingFormModel
  isFundInfoLoading: boolean
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: HoldingFormModel): void
  (event: 'save'): void
  (event: 'fill-name'): void
}>()
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="持仓记录"
    width="720px"
    ok-text="确认"
    cancel-text="取消"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="基金代码">
            <a-input
              :value="form.fundCode"
              :maxlength="6"
              placeholder="先输入 6 位基金代码"
              @update:value="$emit('update:form', { ...form, fundCode: $event })"
              @blur="$emit('fill-name')"
              @press-enter="$emit('fill-name')"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="基金名称">
            <a-input
              :value="form.fundName"
              placeholder="输入代码后自动填充，可手动修改"
              @update:value="$emit('update:form', { ...form, fundName: $event })"
            >
              <template v-if="isFundInfoLoading" #suffix>
                <a-spin size="small" />
              </template>
            </a-input>
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="我的持有金额">
            <a-input-number
              :value="form.myAmount"
              :min="0"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, myAmount: Number($event ?? 0) })"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="我的持有收益">
            <a-input-number
              :value="form.myProfit"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, myProfit: Number($event ?? 0) })"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="博主持有金额">
            <a-input-number
              :value="form.bloggerAmount"
              :min="0"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, bloggerAmount: Number($event ?? 0) })"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="博主持有收益">
            <a-input-number
              :value="form.bloggerProfit"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, bloggerProfit: Number($event ?? 0) })"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>
