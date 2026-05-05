<script setup lang="ts">
import type { InvestorSide, OperationFormModel } from '@/types'

defineProps<{
  open: boolean
  form: OperationFormModel
  formatNumber: (value: number) => string
  title: string
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: OperationFormModel): void
  (event: 'save'): void
  (event: 'sync-my-amount'): void
  (event: 'set-share', owner: InvestorSide, ratio: number): void
  (event: 'sync-convert-amount', owner: InvestorSide): void
  (event: 'fill-target-name'): void
}>()
</script>

<template>
  <a-modal
    :open="open"
    centered
    :title="title"
    width="560px"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col v-if="form.type !== 'convert'" :span="12">
          <a-form-item label="博主金额">
            <a-input-number
              :value="form.bloggerAmount"
              :min="0"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, bloggerAmount: Number($event ?? 0) })"
              @change="$emit('sync-my-amount')"
            />
          </a-form-item>
        </a-col>
        <a-col v-if="form.type !== 'convert'" :span="12">
          <a-form-item label="我的金额">
            <a-input-number
              :value="form.myAmount"
              :min="0"
              :precision="2"
              addon-before="¥"
              @update:value="$emit('update:form', { ...form, myAmount: Number($event ?? 0) })"
            />
          </a-form-item>
        </a-col>
        <template v-if="form.type === 'convert'">
          <a-col :span="12">
            <a-form-item label="博主转出份额">
              <div class="operation-estimate">
                当前总份额：{{ formatNumber(form.bloggerTotalShare) }}
              </div>
              <a-space wrap>
                <a-button @click="$emit('set-share', 'blogger', 1 / 3)">1/3</a-button>
                <a-button @click="$emit('set-share', 'blogger', 1 / 2)">1/2</a-button>
                <a-button @click="$emit('set-share', 'blogger', 1)">全部</a-button>
                <a-input-number
                  :value="form.bloggerShare"
                  :min="0"
                  :max="form.bloggerTotalShare"
                  :precision="2"
                  placeholder="手动输入份额"
                  style="width: 130px"
                  @update:value="
                    $emit('update:form', { ...form, bloggerShare: Number($event ?? 0) })
                  "
                  @change="$emit('sync-convert-amount', 'blogger')"
                />
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="我的转出份额">
              <div class="operation-estimate">
                当前总份额：{{ formatNumber(form.myTotalShare) }}
              </div>
              <a-space wrap>
                <a-button @click="$emit('set-share', 'mine', 1 / 3)">1/3</a-button>
                <a-button @click="$emit('set-share', 'mine', 1 / 2)">1/2</a-button>
                <a-button @click="$emit('set-share', 'mine', 1)">全部</a-button>
                <a-input-number
                  :value="form.myShare"
                  :min="0"
                  :max="form.myTotalShare"
                  :precision="2"
                  placeholder="手动输入份额"
                  style="width: 130px"
                  @update:value="$emit('update:form', { ...form, myShare: Number($event ?? 0) })"
                  @change="$emit('sync-convert-amount', 'mine')"
                />
              </a-space>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="转入基金代码">
              <a-input
                :value="form.toFundCode"
                :maxlength="6"
                placeholder="输入 6 位基金代码"
                @update:value="$emit('update:form', { ...form, toFundCode: $event })"
                @blur="$emit('fill-target-name')"
                @press-enter="$emit('fill-target-name')"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="转入基金名称">
              <a-input
                :value="form.toFundName"
                placeholder="输入代码后自动带出，也可以手动填写"
                @update:value="$emit('update:form', { ...form, toFundName: $event })"
              />
            </a-form-item>
          </a-col>
        </template>
      </a-row>
    </a-form>
  </a-modal>
</template>
