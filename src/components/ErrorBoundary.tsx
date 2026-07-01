import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#DC2626', marginBottom: 8 }}>
            出错了
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#64748B',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {this.state.error?.message || '未知错误'}
          </Text>
          <TouchableOpacity
            onPress={this.handleRetry}
            style={{ padding: 12, borderRadius: 8, backgroundColor: '#2563EB' }}
          >
            <Text style={{ color: '#FFF', fontWeight: '600' }}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}