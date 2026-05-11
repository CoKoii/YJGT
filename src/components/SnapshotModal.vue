<script setup lang="ts">
export type SnapshotForm = {
  fundCode: string
  fundName: string
  myAmount: number
  bloggerAmount: number
}

const props = defineProps<{
  open: boolean
  form: SnapshotForm
  loadingFundInfo: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: SnapshotForm): void
  (event: 'save'): void
  (event: 'fill-name'): void
}>()

function patchForm(value: Partial<SnapshotForm>): void {
  emit('update:form', { ...props.form, ...value })
}
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="买入基金"
    width="720px"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <a-form layout="vertical" class="dense-form">
      <a-row :gutter="[16, 16]">
        <a-col :span="12">
          <a-form-item label="基金代码">
            <a-input
              :value="form.fundCode"
              :maxlength="6"
              placeholder="6 位基金代码"
              @update:value="patchForm({ fundCode: $event })"
              @blur="$emit('fill-name')"
              @press-enter="$emit('fill-name')"
            >
              <template v-if="loadingFundInfo" #suffix>
                <a-spin size="small" />
              </template>
            </a-input>
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="基金名称">
            <a-input
              :value="form.fundName"
              placeholder="输入代码后自动带出"
              @update:value="patchForm({ fundName: $event })"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <div class="form-section">
            <div class="form-section-title">我的买入</div>
            <a-form-item label="买入金额">
              <a-input-number
                :value="form.myAmount"
                :min="0"
                :precision="2"
                addon-before="¥"
                @update:value="patchForm({ myAmount: Number($event ?? 0) })"
              />
            </a-form-item>
          </div>
        </a-col>
        <a-col :span="12">
          <div class="form-section">
            <div class="form-section-title">博主买入</div>
            <a-form-item label="买入金额">
              <a-input-number
                :value="form.bloggerAmount"
                :min="0"
                :precision="2"
                addon-before="¥"
                @update:value="patchForm({ bloggerAmount: Number($event ?? 0) })"
              />
            </a-form-item>
          </div>
        </a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>
