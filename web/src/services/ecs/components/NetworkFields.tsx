import { useEffect, useRef } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { FormMultiselect } from "@shared/components/form/FormFields.tsx";
import { useNetworkOptions } from "../hooks/useNetworkOptions.ts";

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  names: { subnets: Path<TValues>; securityGroups: Path<TValues> };
}

// Subnet + security group cho task Fargate (awsvpc): Run task, Create service, target ECS của EventBridge.
// Form mới (cả hai ô trống) thì chọn sẵn subnet / group mặc định một lần khi danh sách tải xong;
// đang sửa target có sẵn thì giữ nguyên, không tự thêm group
export function NetworkFields<TValues extends FieldValues>({ control, names }: Props<TValues>) {
  const network = useNetworkOptions().data;
  const subnets = useController({ control, name: names.subnets }).field;
  const securityGroups = useController({ control, name: names.securityGroups }).field;
  const filled = useRef(false);

  useEffect(() => {
    if (!network || filled.current) return;
    filled.current = true;
    if (subnets.value?.length || securityGroups.value?.length) return;
    subnets.onChange(network.defaults.subnets);
    securityGroups.onChange(network.defaults.securityGroups);
  }, [network, subnets, securityGroups]);

  return (
    <>
      <FormMultiselect
        control={control}
        name={names.subnets}
        label='Subnets'
        description='Floci needs a subnet that exists; the default subnets are there from the start.'
        placeholder='Choose subnets'
        options={network?.subnets ?? []}
      />
      <FormMultiselect
        control={control}
        name={names.securityGroups}
        label='Security groups - optional'
        placeholder='Choose security groups'
        options={network?.securityGroups ?? []}
      />
    </>
  );
}
