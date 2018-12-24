# pulumi-demo-1

Based on the following demo's:

* https://pulumi.io/quickstart/kubernetes/tutorial-exposed-deployment.html
* https://github.com/pulumi/examples/tree/master/kubernetes-ts-jenkins

## Artifactory via Helm

* `helm repo add jfrog https://charts.jfrog.io`
* `helm repo update`

## GKE Cluster

Below is the code for the cluster.

```typescript
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { nodeCount, nodeMachineType, password, username } from "./gke-config";

export const k8sCluster = new gcp.container.Cluster("gke-cluster", {
    name: "joostvdg-dec-2018-pulumi",
    initialNodeCount: nodeCount,
    nodeVersion: "latest",
    minMasterVersion: "latest",
    nodeConfig: {
        machineType: nodeMachineType,
        oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring"
        ],
    },
});
```

As you probably will want to install other things (Helm charts, services) inside this cluster, we need some more code.
Below is the code - courtesy of [Pulumi's GKE Example](https://github.com/pulumi/examples/tree/master/gcp-ts-gke) - that generates and exports the Kubernetes Client Configuration.

This client configuration can then be used by Helm charts or other Kubernetes services.
Pulumi will then also understand it depends on the cluster and create/update it first before moving on to the others.

```typescript
// Manufacture a GKE-style Kubeconfig. Note that this is slightly "different" because of the way GKE requires
// gcloud to be in the picture for cluster authentication (rather than using the client cert/key directly).
export const k8sConfig = pulumi.
    all([ k8sCluster.name, k8sCluster.endpoint, k8sCluster.masterAuth ]).
    apply(([ name, endpoint, auth ]) => {
        const context = `${gcp.config.project}_${gcp.config.zone}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${auth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
    });

// Export a Kubernetes provider instance that uses our cluster from above.
export const k8sProvider = new k8s.Provider("gkeK8s", {
    kubeconfig: k8sConfig,
});
```

### Pulumi GCP Config

* https://github.com/pulumi/examples/blob/master/gcp-ts-gke/README.md

```bash
export GCP_PROJECT=...
export GCP_ZONE=europe-west4-a
export CLUSTER_PASSWORD=...
export GCP_SA_NAME=...
```

Make sure you have a Google SA (Service Account) by that name first, as you can [read here](https://pulumi.io/quickstart/gcp/index.html). For me it worked best to NOT set any environment variables mentioned.
They invairably caused authentication or authorization issues. Just make sure the SA account and it's credential file (see below) are authorized and the `gcloud` cli works.

```bash
gcloud iam service-accounts keys create gcp-credentials.json \
    --iam-account ${GCP_SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com
gcloud auth activate-service-account --key-file gcp-credentials.json
gcloud auth application-default login
```

```bash
pulumi config set gcp:project ${GCP_PROJECT}
pulumi config set gcp:zone ${GCP_ZONE}
pulumi config set password --secret ${CLUSTER_PASSWORD}
```

#### Post Cluster Creation

```bash
gcloud container clusters get-credentials joostvdg-dec-2018-pulumi
kubectl create clusterrolebinding cluster-admin-binding  --clusterrole cluster-admin  --user $(gcloud config get-value account)
```

#### Install failed

Failed to install `kubernetes:rbac.authorization.k8s.io:Role         artifactory-artifactory`.

Probably due to missing rights, so probably have to execute the admin binding before the helm charts.

```bash
error: Plan apply failed: roles.rbac.authorization.k8s.io "artifactory-artifactory" is forbidden: attempt to grant extra privileges: [{[get] [] [services] [] []} {[watch] [] [services] [] []} {[list] [] [services] [] []} {[get] [] [endpoints] [] []} {[watch] [] [endpoints] [] []} {[list] [] [endpoints] [] []} {[get] [] [pods] [] []} {[watch] [] [pods] [] []} {[list] [] [pods] [] []}] user=&{joostvdg-pulumi@ps-dev-201405.iam.gserviceaccount.com  [system:authenticated] map[user-assertion.cloud.google.com:[AM6SrXjdiAPWuRzgtkR/eeUtypmgxauZle+vOF2EvBnPRd7DtBxVbhq4JDxqwpi8ET96XrdHHjG8VYXkW2TIC8wlekPVoFIb9GhPVLpC2gisYW5LtgjRzazAAZk3Hd1KFbYdL5M9BGzqztaMlAPnMFu4SVak4HEwKploC0PEksmjaNm3J2GTYSQXIyPP5wTLjDrxDtVyCbulta+5ljMgSVo0EjLENV/Mzpsyp9j5bO/uMZku97oIOG+4qqjU2819xs2qzQNPooCxpjn+NdBR]]} ownerrules=[{[create] [authorization.k8s.io] [selfsubjectaccessreviews selfsubjectrulesreviews] [] []} {[get] [] [] [] [/api /api/* /apis /apis/* /healthz /openapi /openapi/* /swagger-2.0.0.pb-v1 /swagger.json /swaggerapi /swaggerapi/* /version /version/]}] ruleResolutionErrors=[]
```

## Helm Charts

Using Pulumi to install a Helm Chart feels a bit like adding layers of wrapping upon wrapping.
The power of Pulumi becomes visible when using more than one related service on the same cluster - for example a SDLC Tool Chain.

This example application installs two helm charts, Jenkins and Artifactory, on a GKE cluster that is also created and managed by Pulumi.

Below is an example of installing a Helm chart of Jenkins, where we provide the Kubernetes config from the GKE cluster as Provider.
This way, Pulumi knows it must install the helm chart in that GKE cluster and not in the current Kubeconfig.

```typescript
import { k8sProvider, k8sConfig } from "./gke-cluster";

const jenkins = new k8s.helm.v2.Chart("jenkins", {
    repo: "stable",
    version: "0.25.1",
    chart: "jenkins",
    }, { 
        providers: { kubernetes: k8sProvider }
    }
);
```

## Deployment & Service

First, make sure you have an interface for the configuration arguments.

```typescript
export interface LdapArgs {
    readonly name: string,
    readonly imageName: string,
    readonly imageTag: string
}
```

Then, create a exportable Pulumi resource class that can be reused.

```typescript
export class LdapInstallation extends pulumi.ComponentResource {
    public readonly deployment: k8s.apps.v1.Deployment;
    public readonly service: k8s.core.v1.Service;

    // constructor
}
```

Inside the constructor placehold we will create a constructor method.
It will do all the configuration we need to do for this resource, in this case a Kubernetes Service and Deployment.

```typescript
constructor(args: LdapArgs) {
    super("k8stypes:service:LdapInstallation", args.name, {});
    const labels = { app: args.name };
    const name = args.name
}
```

First Kubernetes resource to create is a container specification for the Deployment.

```typescript
const container: k8stypes.core.v1.Container = {
    name,
    image: args.imageName + ":" + args.imageTag,
    resources: {
        requests: { cpu: "100m", memory: "200Mi" },
        limits: { cpu: "100m", memory: "200Mi" },
    },
    ports: [{
            name: "ldap",containerPort: 1389,
        },
    ]
};
```

As the configuration arguments can be any TypeScript type, you can allow people to override entire segments (such as Resources).
Which you would do as follows:

```typescript
    resources: args.resources || {
        requests: { cpu: "100m", memory: "200Mi" },
        limits: { cpu: "100m", memory: "200Mi" },
    },
```

The Deployment and Service construction are quite similar.

```typescript
this.deployment = new k8s.apps.v1.Deployment(args.name, {
    spec: {
        selector: { matchLabels: labels },
        replicas: 1,
        template: {
            metadata: { labels: labels },
            spec: { containers: [ container ] },
        },
    },
},{ provider: cluster.k8sProvider });
```

```typescript
this.service = new k8s.core.v1.Service(args.name, {
    metadata: {
        labels: this.deployment.metadata.apply(meta => meta.labels),
    },
    spec: {
        ports: [{
                name: "ldap", port: 389, targetPort: "ldap" , protocol: "TCP"
            },
        ],
        selector: this.deployment.spec.apply(spec => spec.template.metadata.labels),
        type: "ClusterIP",
    },
}, { provider: cluster.k8sProvider });
```