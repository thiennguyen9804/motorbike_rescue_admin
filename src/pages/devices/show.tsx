import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useShow } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import { Badge, Button, Flex, message, Slider, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { Background, ColorMode, Controls, ReactFlow } from '@xyflow/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { DeviceStatus, IDevice } from '@/interfaces/device';
import { socket } from '@/providers/liveProvider';
import { capitalize } from '@/utility/text';
import { nodeTypes } from '@/utility/node';
import {
  HANDLE_DEVICE_DATA_CHANNEL,
  JOIN_DEVICE_ROOM_CHANNEL,
  LEAVE_DEVICE_ROOM_CHANNEL,
} from '@/constants';
import { axiosInstance } from '@refinedev/nestjsx-crud';
import useReactFlow, { Mode } from '@/hooks/use-react-flow';
import { ColorModeContext } from '@/contexts/color-mode';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

export const DeviceShow = () => {
  const { query: queryResult } = useShow<IDevice>({});
  const { data, isLoading } = queryResult;
  const record = data?.data;

  const [device, setDevice] = useState<IDevice | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  const { mode } = useContext(ColorModeContext);
  const {
    setRfInstance,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeClick,
    onConnect,
    setNodes,
    setEdges,
    onViewportChange,
    onContextMenu,
    onPaneClick,
    ref,
    viewport,
  } = useReactFlow();

  const handleDeviceChange = useCallback(
    (updated: IDevice) => {
      setDevice(prev => ({ ...prev, ...updated }));
      if (!record?.template?.desktopPrototype) return;
      const nodesWithValues = (record.template.desktopPrototype.nodes || []).map(node => ({
        ...node,
        data: {
          ...node.data,
          value: device?.channels.find(ch => ch.name === node.data.channel)?.value,
          onChange: handleChannelChange,
        },
      }));

      setNodes(nodesWithValues);
      setEdges(record.template.desktopPrototype.edges || []);
    },
    [device, record?.template?.desktopPrototype]
  );

  // Handle real-time channel value change
  const handleChannelChange = useCallback(
    (name: string, value: string | number | boolean | object) => {
      if (!device || !record?.id) return;
      const channelPrototype = device.template.channels.find(ch => ch.name === name);
      if (!channelPrototype) return;

      const currentChannelData = device.channels.find(ch => ch.name === name);
      if (!currentChannelData) {
        const newChannel = {
          name,
          value,
        };

        handleDeviceChange({
          ...device,
          channels: [...device.channels, newChannel],
        });
      } else {
        handleDeviceChange({
          ...device,
          channels: device.channels.map(ch => (ch.name === name ? { ...ch, value } : ch)),
        });
      }
      socket.emit('device/update', {
        id: record.id,
        channelName: name,
        channelValue: value,
      });
    },
    [device, record?.id]
  );

  // Sync updated device from socket event
  const handleDeviceUpdate = useCallback(
    (updated: IDevice) => {
      if (updated.id === record?.id) {
        setDevice(prev => ({ ...prev, ...updated }));
      }
    },
    [record?.id]
  );

  // Fetch the device token from API
  const fetchDeviceToken = async () => {
    if (!device) return;

    try {
      const { data } = await axiosInstance.get(`/devices/${device.id}/password`);
      setDeviceToken(`${data.deviceKey}-${data.deviceToken}`);
      message.success('Device token created!');
    } catch {
      message.error('Failed to create device token.');
    }
  };

  // Setup initial device state and socket listeners
  useEffect(() => {
    if (!record) return;

    setDevice(prev => ({ ...prev, ...record }));
    socket.emit(JOIN_DEVICE_ROOM_CHANNEL, record.id);
    socket.on(HANDLE_DEVICE_DATA_CHANNEL, handleDeviceUpdate);

    return () => {
      socket.emit(LEAVE_DEVICE_ROOM_CHANNEL, record.id);
      socket.off(HANDLE_DEVICE_DATA_CHANNEL, handleDeviceUpdate);
    };
  }, [record, handleDeviceUpdate]);

  if (!device) return <></>;

  return (
    <Show isLoading={isLoading}>
      <Flex vertical gap={12}>
        <Flex gap={12} align="center">
          <Title level={3} style={{ marginBottom: 0 }}>
            {device.name}
          </Title>
          <Badge
            status={device.status === DeviceStatus.Online ? 'success' : 'error'}
            text={capitalize(device.status)}
          />
          {device.lastUpdate && (
            <>
              <Title level={5} style={{ marginBottom: 0 }}>
                -
              </Title>
              <Title level={5} style={{ margin: 0 }}>
                {dayjs(device.lastUpdate).fromNow()}
              </Title>
            </>
          )}
        </Flex>

        {/* Device Token Section */}
        <Flex vertical>
          <Flex gap={8} align="center">
            <Title level={5} style={{ marginBottom: 0 }}>
              Device token:
            </Title>
            {deviceToken ? (
              <Text code copyable>
                {deviceToken}
              </Text>
            ) : (
              <>
                <Text type="secondary">Click to reveal</Text>
                <Button icon={<EyeOutlined />} onClick={fetchDeviceToken} />
              </>
            )}
          </Flex>
        </Flex>

        {/* Device Owner Link */}
        <Flex>
          <Link to={`/users/${device.userId}`}>
            <Title level={5} style={{ marginBottom: 0 }}>
              {device.user.fullName}
            </Title>
          </Link>
        </Flex>
      </Flex>

      {/* React Flow Graph */}
      <div className="flex flex-col w-full h-[50vh] relative">
        <ReactFlow
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          ref={ref}
          noPanClassName="nopan"
          colorMode={mode as ColorMode}
          nodes={nodes}
          edges={edges}
          onInit={setRfInstance}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onViewportChange={onViewportChange}
          onContextMenu={onContextMenu}
          onPaneClick={onPaneClick}
          viewport={viewport}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Show>
  );
};
