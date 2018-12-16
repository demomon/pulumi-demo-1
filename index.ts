import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
// running on minikube, and if so, create only services of type ClusterIP.
let config = new pulumi.Config();
if (config.require("isMinikube") === "true") {
    throw new Error("This example does not yet support minikube");
}

// Deploy the latest version of the stable/wordpress chart.
const jenkins = new k8s.helm.v2.Chart("jenkins-pulumi", {
    repo: "stable",
    version: "0.25.1",
    chart: "jenkins",
    values: {
        Master: {
            HostName: "jenkins.kearos.net",
            Ingress: {
                Annotations: {
                    "ingress.kubernetes.io/proxy-body-size": "50m",
                    "ingress.kubernetes.io/proxy-request-buffering": "off",
                    "ingress.kubernetes.io/ssl-redirect": "false",
                    "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
                    "nginx.ingress.kubernetes.io/proxy-request-buffering": "off",
                    "nginx.ingress.kubernetes.io/ssl-redirect": "false"
                }
            }
        }
    }
});

// TODO: do proper ingress with tls/certmanager and no Service LoadBalancer
// ServiceType: "ClusterIP",


// TODO: export ip of LoadBalancer (ingress or service)
// Export the public IP for Jenkins.
// const frontend = jenkins.getResourceProperty("v1/Service", "jenkins-pulumi-jenkins", "status");
// export const frontendIp = frontend.apply(status => status.loadBalancer.ingress[0].ip);