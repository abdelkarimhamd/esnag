import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

export interface SelectOption<TValue extends string | number> {
  value: TValue
  label: string
  helper?: string
}

interface SelectProps<TValue extends string | number> {
  label?: string
  options: Array<SelectOption<TValue>>
  value: TValue | null
  onChange: (value: TValue) => void
  horizontal?: boolean
}

export const Select = <TValue extends string | number>({
  label,
  options,
  value,
  onChange,
  horizontal = true,
}: SelectProps<TValue>) => {
  const theme = useAppTheme()
  const Container = horizontal ? ScrollView : View

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text> : null}
      <Container
        horizontal={horizontal}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((option) => {
          const selected = value === option.value
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.optionLabel, { color: selected ? theme.colors.primary : theme.colors.text }]}>
                {option.label}
              </Text>
              {option.helper ? <Text style={[styles.optionHelper, { color: theme.colors.textMuted }]}>{option.helper}</Text> : null}
            </Pressable>
          )
        })}
      </Container>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
    gap: 8,
    paddingVertical: 2,
  },
  option: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 130,
    gap: 2,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  optionHelper: {
    fontSize: 12,
  },
})
