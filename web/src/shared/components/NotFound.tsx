import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import { useFollow } from "../hooks/useFollow.ts";
import { EmptyState } from "./TableStates.tsx";

interface Props {
  title: string;
  description: string;
  backHref: string;
  backText: string;
}

export function NotFound({ title, description, backHref, backText }: Props) {
  const follow = useFollow();
  return (
    <Container>
      <EmptyState
        title={title}
        description={description}
        action={
          <Button href={backHref} onFollow={follow}>
            {backText}
          </Button>
        }
      />
    </Container>
  );
}
