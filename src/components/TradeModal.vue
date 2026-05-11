<script setup lang="ts">
import { computed } from 'vue'
import type { InvestorSide, SideValues, TradeType } from '@/types/portfolio'

export type TradeForm = {
  type: TradeType
  fundCode: string
  fundName: string
  targetFundCode: string
  targetFundName: string
  amounts: SideValues
  shares: SideValues
}

const props = defineProps<{
  open: boolean
  form: TradeForm
  title: string
  loadingTargetFund: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: TradeForm): void
  (event: 'save'): void
  (event: 'sync-my-amount'): void
  (event: 'sync-my-share'): void
  (event: 'set-ratio', owner: InvestorSide, ratio: number): void
  (event: 'fill-target-name'): void
}>()

const amountRatios = [
  { label: '1/4', value: 1 / 4 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 1 / 2 },
  { label: '全部', value: 1 },
]

const typeLabel = computed(() => {
  if (props.form.type === 'buy') return '买入'
  if (props.form.type === 'sell') return '卖出'
  return '转换'
})

function patchForm(value: Partial<TradeForm>): void {
  emit('update:form', { ...props.form, ...value })
}

function patchAmount(side: InvestorSide, value: number): void {
  patchForm({ amounts: { ...props.form.amounts, [side]: value } })
}

function patchShare(side: InvestorSide, value: number): void {
  patchForm({ shares: { ...props.form.shares, [side]: value } })
}
</script>

<template>
  <a-modal
    :open="open"
    centered
    :title="title || typeLabel"
    width="560px"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <a-form layout="vertical" class="dense-form">
      <a-row :gutter="[20, 20]">
        <template v-if="form.type === 'buy'">
          <a-col :span="12">
            <a-form-item label="博主金额">
              <a-input-number
                :value="form.amounts.blogger"
                :min="0"
                :precision="2"
                addon-before="¥"
                @update:value="patchAmount('blogger', Number($event ?? 0))"
                @change="$emit('sync-my-amount')"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="我的金额">
              <a-input-number
                :value="form.amounts.mine"
                :min="0"
                :precision="2"
                addon-before="¥"
                @update:value="patchAmount('mine', Number($event ?? 0))"
              />
            </a-form-item>
          </a-col>
        </template>

        <template v-else>
          <a-col :span="12">
            <a-form-item :label="`博主${form.type === 'sell' ? '卖出' : '转出'}份额`">
              <div class="operation-share-panel">
                <a-space wrap class="operation-share-actions">
                  <a-button
                    v-for="ratio in amountRatios"
                    :key="ratio.label"
                    @click="$emit('set-ratio', 'blogger', ratio.value)"
                  >
                    {{ ratio.label }}
                  </a-button>
                </a-space>
                <a-input-number
                  :value="form.shares.blogger"
                  :min="0"
                  :precision="2"
                  addon-after="份"
                  @update:value="patchShare('blogger', Number($event ?? 0))"
                  @change="$emit('sync-my-share')"
                />
              </div>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="`我的${form.type === 'sell' ? '卖出' : '转出'}份额`">
              <div class="operation-share-panel">
                <a-space wrap class="operation-share-actions">
                  <a-button
                    v-for="ratio in amountRatios"
                    :key="ratio.label"
                    @click="$emit('set-ratio', 'mine', ratio.value)"
                  >
                    {{ ratio.label }}
                  </a-button>
                </a-space>
                <a-input-number
                  :value="form.shares.mine"
                  :min="0"
                  :precision="2"
                  addon-after="份"
                  @update:value="patchShare('mine', Number($event ?? 0))"
                />
              </div>
            </a-form-item>
          </a-col>
        </template>

        <template v-if="form.type === 'convert'">
          <a-col :span="12">
            <a-form-item label="转入基金代码">
              <a-input
                :value="form.targetFundCode"
                :maxlength="6"
                placeholder="输入 6 位基金代码"
                @update:value="patchForm({ targetFundCode: $event })"
                @blur="$emit('fill-target-name')"
                @press-enter="$emit('fill-target-name')"
              >
                <template v-if="loadingTargetFund" #suffix>
                  <a-spin size="small" />
                </template>
              </a-input>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="转入基金名称">
              <a-input
                :value="form.targetFundName"
                placeholder="输入代码后自动带出，也可以手动填写"
                @update:value="patchForm({ targetFundName: $event })"
              />
            </a-form-item>
          </a-col>
        </template>
      </a-row>
    </a-form>
  </a-modal>
</template>
