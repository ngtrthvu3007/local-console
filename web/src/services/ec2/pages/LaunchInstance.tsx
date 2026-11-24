import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { errorMessage, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_AMI_ARCHITECTURE,
  DEFAULT_AMI_DESCRIPTION,
  DEFAULT_INSTANCE_TYPE,
  INSTANCE_TYPES,
  USER_DATA_EDITOR_HEIGHT_PX,
} from "../constants.ts";
import { OsIcon } from "../components/OsIcon.tsx";
import { amiWarning } from "../images.ts";
import { useImages } from "../hooks/useImages.ts";
import { useLaunchInstance } from "../hooks/useInstances.ts";
import { ec2BaseCrumbs, ec2Routes } from "../routes.ts";
import { launchInstanceSchema, type LaunchInstanceForm } from "../schemas.ts";

const INSTANCE_TYPE_OPTIONS = INSTANCE_TYPES.map((type) => ({ value: type, label: type }));

const INITIAL_VALUES: LaunchInstanceForm = {
  name: "",
  imageId: "",
  instanceType: DEFAULT_INSTANCE_TYPE,
  userData: "",
};

export function LaunchInstance() {
  useBreadcrumbs([...ec2BaseCrumbs, { text: "Launch instance", href: ec2Routes.launchInstance }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const images = useImages();
  const launch = useLaunchInstance();
  const form = useZodForm(launchInstanceSchema, INITIAL_VALUES);

  const imageId = useWatch({ control: form.control, name: "imageId" });
  const warning = amiWarning(images.data?.find((image) => image.ImageId === imageId));

  const imageOptions = (images.data ?? []).map((image) => ({
    value: image.ImageId ?? "",
    label: `${image.Description ?? image.Name} (${image.Architecture})`,
    description: image.ImageId,
    iconSvg: <OsIcon image={image} />,
  }));
  // Chọn sẵn Amazon Linux 2023 khi catalog tải xong, trừ khi người dùng đã chọn
  const { getValues, setValue } = form;
  useEffect(() => {
    const defaultImage = images.data?.find(
      (image) =>
        image.Description === DEFAULT_AMI_DESCRIPTION &&
        image.Architecture === DEFAULT_AMI_ARCHITECTURE,
    );
    if (defaultImage?.ImageId && !getValues("imageId")) setValue("imageId", defaultImage.ImageId);
  }, [images.data, getValues, setValue]);

  const submit = form.handleSubmit((values) =>
    launch
      .mutateAsync(
        values,
        notifyOutcome({
          success: (id) => `Launched instance ${id}`,
          errorHeader: "Couldn't launch the instance",
          then: (id) => navigate(ec2Routes.instance(id)),
        }),
      )
      // Lỗi đã báo bằng notifyOutcome; chỉ cần giữ promise để biết khi nào gửi xong
      .catch(() => undefined),
  );
  // Form kiểm tra bất đồng bộ nên isPending chưa kịp bật khi lần bấm thứ hai tới: không có ref này,
  // bấm đúp Launch tạo hai instance (đã gặp ở E2E)
  const submitting = useRef(false);
  const submitOnce = async () => {
    if (submitting.current) return;
    submitting.current = true;

    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={ec2Routes.instances} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={launch.isPending}>
        Launch instance
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce();
      }}
    >
      <Form
        header={
          <Header
            variant='h1'
            description='Floci starts the instance as a container. The first time can take a minute while it pulls the image.'
          >
            Launch an instance
          </Header>
        }
        actions={actions}
      >
        <Container header={<Header variant='h2'>Instance</Header>}>
          <SpaceBetween size='l'>
            <FormInput
              control={form.control}
              name='name'
              label='Name'
              constraintText='Optional. Saved as the Name tag.'
              placeholder='web-1'
            />
            {images.isError && (
              <Alert
                type='error'
                header="Couldn't load the AMI list"
                action={<Button onClick={() => images.refetch()}>Retry</Button>}
              >
                {errorMessage(images.error)}
              </Alert>
            )}
            <FormSelect
              control={form.control}
              name='imageId'
              label='AMI'
              options={imageOptions}
              placeholder='Choose an AMI'
            />
            {warning && <Alert type='warning'>{warning}</Alert>}
            <FormSelect
              control={form.control}
              name='instanceType'
              label='Instance type'
              description="Floci doesn't change the container's resources by type."
              options={INSTANCE_TYPE_OPTIONS}
            />
            <FormValueEditor
              control={form.control}
              name='userData'
              label='User data'
              description='Optional. User data needs internet access: Floci installs SSH in the container before running it. To reach an RDS database, use its endpoint from the RDS page.'
              height={USER_DATA_EDITOR_HEIGHT_PX}
              language='text'
            />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
