import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { basicAuthorization } from "../credentials.ts";
import { signInSchema } from "../schemas.ts";

interface Props {
  brokerName: string;
  error?: string; // lần đăng nhập trước sai user/pass
  username?: string; // user của lần trước: form mount lại sau khi sai, không bắt gõ lại
  onSignIn: (authorization: string, username: string) => void;
}

// User/pass chỉ kiểm tra khi gọi RabbitMQ lần đầu; sai thì quay lại form này kèm lỗi
export function SignIn({ brokerName, error, username = "", onSignIn }: Props) {
  const form = useZodForm(signInSchema, { username, password: "" });
  const submit = form.handleSubmit((values) =>
    onSignIn(basicAuthorization(values.username, values.password), values.username),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Container
        header={
          <Header
            variant='h2'
            description="Use the user you set when you created the broker. It's kept in this browser tab only."
          >
            Sign in to {brokerName}
          </Header>
        }
      >
        <Form
          errorText={error}
          actions={
            <ResponsiveActions footer>
              <Button variant='primary' formAction='submit'>
                Sign in
              </Button>
            </ResponsiveActions>
          }
        >
          <SpaceBetween size='m'>
            <FormInput control={form.control} name='username' label='Username' autoFocus />
            <FormInput control={form.control} name='password' label='Password' type='password' />
          </SpaceBetween>
        </Form>
      </Container>
    </form>
  );
}
