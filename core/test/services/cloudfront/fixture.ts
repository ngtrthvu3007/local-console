import type { DistributionConfig } from "@aws-sdk/client-cloudfront";

// GetDistributionConfig của Floci 2.4.0 (2026-11-25) cho một distribution kiểu CDK: OAC, custom header,
// function gắn behavior, ForwardedValues, error page 500. Floci bỏ Items khi danh sách rỗng
export const fixture = {
  CallerReference: "fixture",
  Origins: {
    Quantity: 2,
    Items: [
      {
        Id: "my.site.s3.ap-southeast-1.amazonaws.com",
        DomainName: "my.site.s3.ap-southeast-1.amazonaws.com",
        OriginPath: "",
        CustomHeaders: {
          Quantity: 0,
        },
        S3OriginConfig: {
          OriginAccessIdentity: "",
        },
        ConnectionAttempts: 3,
        ConnectionTimeout: 10,
        ResponseCompletionTimeout: 0,
        OriginAccessControlId: "27bb5e90-ae03-4852-9df3-2e1d6ba4e69f",
      },
      {
        Id: "api",
        DomainName: "api.example.com",
        OriginPath: "/v1",
        CustomHeaders: {
          Quantity: 1,
          Items: [
            {
              HeaderName: "x-key",
              HeaderValue: "k",
            },
          ],
        },
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "https-only",
          OriginSslProtocols: {
            Quantity: 1,
            Items: ["TLSv1.2"],
          },
          OriginReadTimeout: 30,
          OriginKeepaliveTimeout: 5,
        },
        ConnectionAttempts: 3,
        ConnectionTimeout: 10,
        ResponseCompletionTimeout: 0,
      },
    ],
  },
  DefaultCacheBehavior: {
    TargetOriginId: "my.site.s3.ap-southeast-1.amazonaws.com",
    ViewerProtocolPolicy: "redirect-to-https",
    TrustedSigners: {
      Enabled: false,
      Quantity: 0,
    },
    TrustedKeyGroups: {
      Enabled: false,
      Quantity: 0,
    },
    AllowedMethods: {
      Quantity: 2,
      Items: ["GET", "HEAD"],
    },
    SmoothStreaming: false,
    Compress: false,
    LambdaFunctionAssociations: {
      Quantity: 0,
    },
    FunctionAssociations: {
      Quantity: 0,
    },
    FieldLevelEncryptionId: "",
    CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
    MinTTL: 0,
  },
  Comment: "web app",
  Enabled: true,
  Aliases: {
    Quantity: 0,
  },
  DefaultRootObject: "index.html",
  OriginGroups: {
    Quantity: 0,
  },
  CacheBehaviors: {
    Quantity: 2,
    Items: [
      {
        PathPattern: "/api/*",
        TargetOriginId: "api",
        ViewerProtocolPolicy: "https-only",
        TrustedSigners: {
          Enabled: false,
          Quantity: 0,
        },
        TrustedKeyGroups: {
          Enabled: false,
          Quantity: 0,
        },
        AllowedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"],
        },
        SmoothStreaming: false,
        Compress: false,
        LambdaFunctionAssociations: {
          Quantity: 0,
        },
        FunctionAssociations: {
          Quantity: 1,
          Items: [
            {
              FunctionARN: "arn:aws:cloudfront::000000000000:function/lc-it-cffix",
              EventType: "viewer-request",
            },
          ],
        },
        FieldLevelEncryptionId: "",
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        MinTTL: 0,
      },
      {
        PathPattern: "/assets/*",
        TargetOriginId: "my.site.s3.ap-southeast-1.amazonaws.com",
        ViewerProtocolPolicy: "allow-all",
        TrustedSigners: {
          Enabled: false,
          Quantity: 0,
        },
        TrustedKeyGroups: {
          Enabled: false,
          Quantity: 0,
        },
        AllowedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"],
        },
        SmoothStreaming: false,
        Compress: false,
        LambdaFunctionAssociations: {
          Quantity: 0,
        },
        FunctionAssociations: {
          Quantity: 0,
        },
        FieldLevelEncryptionId: "",
        ForwardedValues: {
          QueryString: false,
          Cookies: {
            Forward: "none",
            WhitelistedNames: {
              Quantity: 0,
            },
          },
          Headers: {
            Quantity: 0,
          },
          QueryStringCacheKeys: {
            Quantity: 0,
          },
        },
        MinTTL: 0,
      },
    ],
  },
  CustomErrorResponses: {
    Quantity: 1,
    Items: [
      {
        ErrorCode: 500,
        ResponsePagePath: "/error.html",
        ResponseCode: "500",
        ErrorCachingMinTTL: 10,
      },
    ],
  },
  Logging: {
    Enabled: false,
    IncludeCookies: false,
    Bucket: "",
    Prefix: "",
  },
  PriceClass: "PriceClass_All",
  ViewerCertificate: {
    CloudFrontDefaultCertificate: true,
    MinimumProtocolVersion: "TLSv1.2_2021",
  },
  Restrictions: {
    GeoRestriction: {
      RestrictionType: "none",
      Quantity: 0,
    },
  },
  HttpVersion: "http2",
  IsIPV6Enabled: true,
} satisfies DistributionConfig;
