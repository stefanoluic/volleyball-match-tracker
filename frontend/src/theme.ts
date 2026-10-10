import { Button, createTheme, Modal, Paper, PasswordInput, Select, TextInput } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  headings: { fontFamily: '"Segoe UI", system-ui, sans-serif', fontWeight: '700' },
  colors: {
    blue: ['#edf4fc', '#dbe8f7', '#b7cfea', '#8eb4df', '#6497cf',
      '#3b7dbb', '#2563a6', '#20558e', '#1b4675', '#163653'],
    teal: ['#eaf8f5', '#d2efe8', '#a8ded4', '#79cbbe', '#50b5a6',
      '#29998c', '#137d73', '#10695f', '#0e554e', '#0b443e'],
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
