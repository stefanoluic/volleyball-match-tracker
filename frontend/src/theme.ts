import { Button, createTheme, Modal, Paper, PasswordInput, Select, TextInput } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  headings: { fontFamily: '"Segoe UI", system-ui, sans-serif', fontWeight: '700' },
  colors: {
    blue: ['#edf4ff', '#dce8fa', '#b8d0ef', '#90b6e5', '#689bdc',
      '#4e89d6', '#3475c5', '#2863aa', '#204f87', '#193d68'],
  },
  components: {
    Button: Button.extend({ defaultProps: { fw: 600 } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'md' } }),
    Select: Select.extend({ defaultProps: { size: 'md' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'lg', overlayProps: { backgroundOpacity: 0.35, blur: 3 } } }),
  },
});
